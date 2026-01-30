from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from qiita_db.study import Study, StudyPerson
from qiita_db.sql_connection import TRN
import pandas as pd
import json
from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("API_KEY")

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Initialize Claude client
client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)

def search_studies_with_sql(custom_sql_where="", params=None):
    print("Executing search_studies_with_sql")
    """
    Search studies using custom SQL WHERE clause
    
    Parameters
    ----------
    custom_sql_where : str
        Custom WHERE clause (without the WHERE keyword)
    params : list
        Parameters for the SQL query
    
    Returns
    -------
    list
        List of dictionaries with study information
    """
    if params is None:
        params = []
    
    with TRN:
        sql = f"""
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               sp_pi.name as pi_name, sp_pi.email as pi_email, 
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name
        FROM qiita.study s
        LEFT JOIN qiita.study_person sp_pi 
            ON s.principal_investigator_id = sp_pi.study_person_id
        LEFT JOIN qiita.study_person sp_lab 
            ON s.lab_person_id = sp_lab.study_person_id
        LEFT JOIN qiita.study_artifact sa ON s.study_id = sa.study_id
        LEFT JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
        LEFT JOIN qiita.visibility v ON a.visibility_id = v.visibility_id
        WHERE {custom_sql_where if custom_sql_where else '1=1'}
        ORDER BY s.study_id
        """
        
        TRN.add(sql, params)
        results = TRN.execute_fetchindex()
    
    if not results:
        return []
    
    # Convert to list of dictionaries
    studies = []
    for row in results:
        studies.append({
            'study_id': row[0],
            'study_title': row[1],
            'study_abstract': row[2],
            'pi_name': row[3],
            'pi_email': row[4],
            'pi_affiliation': row[5],
            'lab_person_name': row[6]
        })
    
    return studies

def llm_query_to_sql(user_query):
    print(f"Processing LLM query: {user_query}")
    """Convert natural language query to SQL using LLM"""
    system_prompt = """You are a SQL query generator for a microbiome study database (Qiita).

        Available tables and columns:
        - s.study_id (integer)
        - s.study_title (text)
        - s.study_abstract (text)
        - sp_pi.name (text) - Principal Investigator name
        - sp_pi.email (text) - PI email
        - sp_pi.affiliation (text) - PI institution
        - sp_lab.name (text) - Lab person name
        - v.visibility (text) - Values: 'public', 'private', 'sandbox', 'awaiting_approval'

        Your task:
        1. Convert the user's natural language query into a PostgreSQL WHERE clause
        2. Use ILIKE for case-insensitive text matching (e.g., field ILIKE '%keyword%')
        3. Use parameterized queries with %s placeholders
        4. Return ONLY a JSON object with 'where_clause' and 'params' fields

        Examples:

        User: "Find studies about soil microbiome"
        Response: {
        "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
        "params": ["%soil%", "%soil%"]
        }

        User: "Studies by Rob Knight"
        Response: {
        "where_clause": "sp_pi.name ILIKE %s",
        "params": ["%Rob Knight%"]
        }

        Return ONLY valid JSON, no other text."""

    message = client.chat.completions.create(
        model="gemma3",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query}
        ]
    )

    response_text = message.choices[0].message.content.strip()
    
    # Remove markdown code blocks if present
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()
    
    try:
        result = json.loads(response_text)
        return result
    except json.JSONDecodeError:
        print(f"Warning: Could not parse LLM response: {response_text}")
        # Extract keywords from query
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"]
        }

@app.route('/api/search', methods=['POST'])
def search():
    """API endpoint for searching studies"""
    print("Received search request")
    try:
        data = request.get_json()
        user_query = data.get('query', '')
        
        if not user_query:
            return jsonify({'error': 'Query is required'}), 400
        
        print(f"Processing query: '{user_query}'")
        
        # Convert to SQL using LLM
        sql_query = llm_query_to_sql(user_query)
        
        print(f"Generated WHERE clause: {sql_query['where_clause']}")
        print(f"Parameters: {sql_query['params']}")
        
        # Execute search
        results = search_studies_with_sql(
            custom_sql_where=sql_query['where_clause'],
            params=sql_query['params']
        )
        
        return jsonify({
            'results': results,
            'sql_query': sql_query,
            'count': len(results)
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("=" * 80)
    print("QIITA SEARCH API SERVER")
    print("=" * 80)
    print("Starting Flask server on http://localhost:5001")
    print("=" * 80)
    app.run(debug=True, host='0.0.0.0', port=5001)
