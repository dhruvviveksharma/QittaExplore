# backend/services/study_service.py
from qiita_db.sql_connection import TRN

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
    list
        List of dictionaries with study information
    """
    if params is None:
        params = []
    
    with TRN:
        sql = f"""
        SELECT DISTINCT s.study_id, s.study_title, s.study_abstract,
               s.study_alias, s.metadata_complete,
               sp_pi.name as pi_name, sp_pi.email as pi_email,
               sp_pi.affiliation as pi_affiliation,
               sp_lab.name as lab_person_name,
               (SELECT COUNT(*)
                FROM qiita.study_sample ss
                WHERE ss.study_id = s.study_id) AS num_samples,
               (SELECT STRING_AGG(DISTINCT dt2.data_type, ', ')
                FROM qiita.study_prep_template spt2
                JOIN qiita.prep_template pt2 ON spt2.prep_template_id = pt2.prep_template_id
                JOIN qiita.data_type dt2 ON pt2.data_type_id = dt2.data_type_id
                WHERE spt2.study_id = s.study_id) AS data_types,
               (SELECT COUNT(DISTINCT spt3.prep_template_id)
                FROM qiita.study_prep_template spt3
                WHERE spt3.study_id = s.study_id) AS num_preps
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
        LIMIT 50
        """

        TRN.add(sql, params)
        results = TRN.execute_fetchindex()

    if not results:
        return []

    studies = []
    for row in results:
        studies.append({
            'study_id': row[0],
            'study_title': row[1],
            'study_abstract': row[2],
            'study_alias': row[3],
            'metadata_complete': row[4],
            'pi_name': row[5],
            'pi_email': row[6],
            'pi_affiliation': row[7],
            'lab_person_name': row[8],
            'num_samples': row[9],
            'data_types': row[10],
            'num_preps': row[11],
        })

    return studies