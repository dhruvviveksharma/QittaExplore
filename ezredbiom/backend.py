from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from openai import OpenAI
from qiita_db.study import Study
from qiita_db.artifact import Artifact
from qiita_db.sql_connection import TRN
from qiita_db.metadata_template.prep_template import PrepTemplate
import json
from dotenv import load_dotenv
import os
import io
import zipfile

load_dotenv()
API_KEY = os.getenv("API_KEY")

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Initialize Claude client
client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)

def search_studies_with_sql(custom_sql_where="", params=None, limit=50):
    """
    Search studies using custom SQL WHERE clause
    
    Parameters
    ----------
    custom_sql_where : str
        Custom WHERE clause (without the WHERE keyword)
    params : list
        Parameters for the SQL query
    limit : int
        Maximum number of results to return
    
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
               sp_lab.name as lab_person_name,
               COUNT(DISTINCT sa.artifact_id) as artifact_count,
               v.visibility
        FROM qiita.study s
        LEFT JOIN qiita.study_person sp_pi 
            ON s.principal_investigator_id = sp_pi.study_person_id
        LEFT JOIN qiita.study_person sp_lab 
            ON s.lab_person_id = sp_lab.study_person_id
        LEFT JOIN qiita.study_artifact sa ON s.study_id = sa.study_id
        LEFT JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
        LEFT JOIN qiita.visibility v ON a.visibility_id = v.visibility_id
        WHERE {custom_sql_where if custom_sql_where else '1=1'}
        GROUP BY s.study_id, s.study_title, s.study_abstract, 
                 sp_pi.name, sp_pi.email, sp_pi.affiliation, 
                 sp_lab.name, v.visibility
        ORDER BY s.study_id DESC
        LIMIT {limit}
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
            'lab_person_name': row[6],
            'artifact_count': row[7],
            'visibility': row[8]
        })
    
    return studies

def get_study_details(study_id):
    """Get detailed information about a specific study"""
    try:
        study_obj = Study(study_id)
        
        # Get all study info
        study_info = study_obj.info
        
        study = {
            'study_id': study_id,
            'study_title': study_obj.title,
            'study_abstract': study_info.get('study_abstract', ''),
            'study_description': study_info.get('study_description', ''),
            'pi_name': study_info.get('principal_investigator', {}).get('name', None),
            'pi_email': study_info.get('principal_investigator', {}).get('email', None),
            'pi_affiliation': study_info.get('principal_investigator', {}).get('affiliation', None),
            'lab_person': study_info.get('lab_person', {}),
            'ebi_study_accession': study_obj.ebi_study_accession,
            'ebi_submission_status': study_obj.ebi_submission_status,
            'shared_with': study_info.get('shared_with', []),
            'number_samples_collected': study_info.get('number_samples_collected', None),
            'number_samples_promised': study_info.get('number_samples_promised', None),
        }
        
        # Get publications
        try:
            publications = []
            for pub in study_obj.publications:
                publications.append({
                    'doi': pub.get('doi', ''),
                    'pubmed_id': pub.get('pubmed_id', ''),
                })
            study['publications'] = publications
        except:
            study['publications'] = []
        
        # Get tags
        try:
            study['tags'] = list(study_obj.tags)
        except:
            study['tags'] = []
        
        # Get sample template info
        try:
            sample_template = study_obj.sample_template
            if sample_template:
                study['sample_count'] = len(sample_template)
                study['sample_categories'] = list(sample_template.categories)
        except:
            study['sample_count'] = None
            study['sample_categories'] = []
        
        # Get artifacts with more details
        with TRN:
            sql = """
            SELECT a.artifact_id, a.artifact_type, a.name, 
                   v.visibility, a.created_timestamp,
                   COUNT(DISTINCT ap.prep_template_id) as prep_count
            FROM qiita.study_artifact sa
            JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
            JOIN qiita.visibility v ON a.visibility_id = v.visibility_id
            LEFT JOIN qiita.artifact_processing_job apj ON a.artifact_id = apj.artifact_id
            LEFT JOIN qiita.artifact_output_processing_job aopj ON a.artifact_id = aopj.artifact_id
            LEFT JOIN qiita.prep_template_artifact_link pta ON a.artifact_id = pta.artifact_id
            LEFT JOIN qiita.artifact_prep_composition ap ON a.artifact_id = ap.artifact_id
            WHERE sa.study_id = %s
            GROUP BY a.artifact_id, a.artifact_type, a.name, v.visibility, a.created_timestamp
            ORDER BY a.artifact_id
            """
            TRN.add(sql, [study_id])
            artifacts = TRN.execute_fetchindex()
            
            study['artifacts'] = [{
                'artifact_id': art[0],
                'artifact_type': art[1],
                'name': art[2],
                'visibility': art[3],
                'created_timestamp': str(art[4]) if art[4] else None,
                'prep_count': art[5] or 0
            } for art in artifacts]
        
        # Get data types (from prep templates)
        try:
            data_types = set()
            for artifact_id in study_obj.artifacts():
                try:
                    artifact = Artifact(artifact_id)
                    if hasattr(artifact, 'prep_templates'):
                        for prep in artifact.prep_templates:
                            if hasattr(prep, 'data_type'):
                                data_types.add(prep.data_type())
                except:
                    pass
            study['data_types'] = list(data_types)
        except:
            study['data_types'] = []
        
        return study
        
    except Exception as e:
        print(f"Error fetching study details: {e}")
        import traceback
        traceback.print_exc()
        return None

def llm_query_to_sql(user_query):
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

    try:
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
        
        result = json.loads(response_text)
        return result
    except Exception as e:
        print(f"LLM query error: {e}")
        # Fallback to simple keyword search
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"]
        }

@app.route('/api/studies', methods=['GET'])
def list_studies():
    """Get list of recent studies (default view)"""
    print("\n" + "="*80)
    print("LIST STUDIES REQUEST")
    print("="*80)
    try:
        limit = request.args.get('limit', 50, type=int)
        limit = min(limit, 100)  # Cap at 100
        
        print(f"Fetching {limit} most recent studies...")
        
        results = search_studies_with_sql(
            custom_sql_where="1=1",
            params=[],
            limit=limit
        )
        
        print(f"Found {len(results)} studies")
        print("="*80 + "\n")
        
        return jsonify({
            'results': results,
            'count': len(results)
        })
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        print("="*80 + "\n")
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search():
    """API endpoint for searching studies"""
    print("\n" + "="*80)
    print("NEW SEARCH REQUEST RECEIVED")
    print("="*80)
    try:
        data = request.get_json()
        print(f"Request data: {data}")
        user_query = data.get('query', '')
        print(f"Extracted query: '{user_query}'")
        
        if not user_query:
            print("ERROR: Empty query")
            return jsonify({'error': 'Query is required'}), 400
        
        print(f"Processing query: '{user_query}'")
        
        # Convert to SQL using LLM
        print("Calling LLM to generate SQL...")
        sql_query = llm_query_to_sql(user_query)
        
        print(f"Generated WHERE clause: {sql_query['where_clause']}")
        print(f"Parameters: {sql_query['params']}")
        
        # Execute search
        print("Executing database query...")
        results = search_studies_with_sql(
            custom_sql_where=sql_query['where_clause'],
            params=sql_query['params']
        )
        
        print(f"Found {len(results)} results")
        print("="*80 + "\n")
        
        return jsonify({
            'results': results,
            'sql_query': sql_query,
            'count': len(results)
        })
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        print("="*80 + "\n")
        return jsonify({'error': str(e)}), 500

@app.route('/api/study/<int:study_id>', methods=['GET'])
def get_study(study_id):
    """Get detailed information about a specific study"""
    print(f"\nFetching details for study {study_id}...")
    try:
        study = get_study_details(study_id)
        
        if not study:
            return jsonify({'error': 'Study not found'}), 404
        
        return jsonify(study)
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/study/<int:study_id>/download', methods=['GET'])
def download_study_data(study_id):
    """Download study metadata and tables as a zip file"""
    print(f"\nDownloading data for study {study_id}...")
    try:
        study_obj = Study(study_id)
        
        # Create in-memory zip file
        memory_file = io.BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add study info
            study_info = {
                'study_id': study_id,
                'title': study_obj.title,
                'abstract': study_obj.info.get('study_abstract', ''),
                'pi': study_obj.info.get('principal_investigator', {}),
            }
            zf.writestr('study_info.json', json.dumps(study_info, indent=2))
            
            # Add sample info
            try:
                sample_template = study_obj.sample_template
                if sample_template:
                    df = sample_template.to_dataframe()
                    zf.writestr('sample_metadata.txt', df.to_csv(sep='\t'))
            except Exception as e:
                print(f"Could not export sample template: {e}")
            
            # Add prep templates
            for artifact_id in study_obj.artifacts():
                try:
                    artifact = Artifact(artifact_id)
                    prep_templates = artifact.prep_templates
                    
                    for prep in prep_templates:
                        df = prep.to_dataframe()
                        filename = f'prep_template_{prep.id}.txt'
                        zf.writestr(filename, df.to_csv(sep='\t'))
                except Exception as e:
                    print(f"Could not export artifact {artifact_id}: {e}")
        
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'study_{study_id}_data.zip'
        )
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
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