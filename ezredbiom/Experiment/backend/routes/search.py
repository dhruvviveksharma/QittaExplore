# backend/routes/search.py
from services.llm import llm_query_to_sql
from services.study_service import search_studies_with_sql
from flask import Blueprint, request, jsonify

search_bp = Blueprint('search', __name__)

@search_bp.route('/search', methods=['POST'])
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

@search_bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})
