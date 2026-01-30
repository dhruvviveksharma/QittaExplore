import streamlit as st
import pandas as pd
from openai import OpenAI
from qiita_db.study import Study, StudyPerson
from qiita_db.sql_connection import TRN
import json
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()
API_KEY = os.getenv("API_KEY")

# Initialize Claude client
@st.cache_resource
def get_client():
    return OpenAI(
        api_key=API_KEY,
        base_url="https://ellm.nrp-nautilus.io/v1"
    )

def search_studies_with_sql(custom_sql_where="", params=None):
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
    pd.DataFrame
        DataFrame with study information
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
        return pd.DataFrame()
    
    df = pd.DataFrame(results, columns=[
        'study_id', 'study_title', 'study_abstract', 
        'pi_name', 'pi_email', 'pi_affiliation', 'lab_person_name'
    ])
    
    return df

def llm_query_to_sql(user_query, client):
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
        st.warning(f"Could not parse LLM response, using fallback search")
        # Extract keywords from query
        keywords = user_query.lower().replace("find", "").replace("studies", "").replace("about", "").strip()
        return {
            "where_clause": "(s.study_title ILIKE %s OR s.study_abstract ILIKE %s)",
            "params": [f"%{keywords}%", f"%{keywords}%"]
        }

def smart_search_studies(user_query, client):
    """
    Search studies using natural language query powered by LLM
    
    Parameters
    ----------
    user_query : str
        Natural language query
    client : OpenAI
        OpenAI client instance
    
    Returns
    -------
    pd.DataFrame
        DataFrame with matching studies
    dict
        SQL query information
    """
    # Convert to SQL using LLM
    sql_query = llm_query_to_sql(user_query, client)
    
    # Execute search
    results = search_studies_with_sql(
        custom_sql_where=sql_query['where_clause'],
        params=sql_query['params']
    )
    
    return results, sql_query

# Streamlit UI
def main():
    st.set_page_config(
        page_title="Qiita Study Search",
        page_icon="🔬",
        layout="wide"
    )
    
    # Header
    st.title("🔬 Qiita Study Search")
    st.markdown("Search microbiome studies using natural language queries powered by LLM")
    
    # Initialize client
    client = get_client()
    
    # Sidebar with example queries
    with st.sidebar:
        st.header("Example Queries")
        st.markdown("""
        Try these example searches:
        - *Find studies about soil microbiome*
        - *Studies by Rob Knight*
        - *Research on gut bacteria*
        - *Public studies about ocean samples*
        - *Studies from UC San Diego*
        """)
        
        st.markdown("---")
        st.markdown("**About**")
        st.markdown("""
        This tool uses AI to convert your natural language queries 
        into SQL and search the [Qiita database](https://github.com/qiita-spots/qiita/blob/a34dcebc44ea6408340d31ecaf0efd1f78e3cc6b/qiita_pet/templates/redbiom.html#L9).
        """)
    
    # Search input
    col1, col2 = st.columns([4, 1])
    with col1:
        query = st.text_input(
            "Enter your search query:",
            placeholder="e.g., Find studies about soil microbiome by Rob Knight",
            label_visibility="collapsed"
        )
    with col2:
        search_button = st.button("🔍 Search", type="primary", use_container_width=True)
    
    # Show SQL toggle
    show_sql = st.checkbox("Show generated SQL query", value=False)
    
    # Perform search
    if search_button and query:
        with st.spinner("Searching studies..."):
            try:
                results, sql_query = smart_search_studies(query, client)
                
                # Show SQL if requested
                if show_sql:
                    with st.expander("Generated SQL Query", expanded=True):
                        st.code(f"WHERE {sql_query['where_clause']}", language="sql")
                        st.json({"parameters": sql_query['params']})
                
                # Display results
                if not results.empty:
                    st.success(f"Found {len(results)} studies")
                    
                    # Display each study
                    for idx, row in results.iterrows():
                        with st.container():
                            st.markdown(f"### Study {row['study_id']}: {row['study_title']}")
                            
                            col1, col2 = st.columns([2, 1])
                            
                            with col1:
                                st.markdown(f"**Abstract:**")
                                abstract = row['study_abstract'] if pd.notna(row['study_abstract']) else "No abstract available"
                                st.markdown(abstract)
                            
                            with col2:
                                st.markdown("**Principal Investigator:**")
                                if pd.notna(row['pi_name']):
                                    st.write(f"👤 {row['pi_name']}")
                                    if pd.notna(row['pi_affiliation']):
                                        st.write(f"🏛️ {row['pi_affiliation']}")
                                    if pd.notna(row['pi_email']):
                                        st.write(f"📧 {row['pi_email']}")
                                else:
                                    st.write("No PI information available")
                                
                                if pd.notna(row['lab_person_name']):
                                    st.markdown("**Lab Person:**")
                                    st.write(f"👥 {row['lab_person_name']}")
                            
                            st.markdown("---")
                    
                    # Download option
                    csv = results.to_csv(index=False)
                    st.download_button(
                        label="📥 Download Results as CSV",
                        data=csv,
                        file_name=f"qiita_search_results.csv",
                        mime="text/csv"
                    )
                else:
                    st.warning("No studies found matching your query. Try rephrasing or using different keywords.")
                    
            except Exception as e:
                st.error(f"An error occurred: {str(e)}")
                st.exception(e)
    
    elif search_button and not query:
        st.warning("Please enter a search query")

if __name__ == "__main__":
    main()