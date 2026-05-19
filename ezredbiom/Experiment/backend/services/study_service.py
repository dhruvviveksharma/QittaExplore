"""Study lookup service. Talks to a Postgres backend over a TCP connection.

In production, the backend is barnacle's qiita database, reached through an
SSH `-L` tunnel that maps localhost:PG_PORT to barnacle's Postgres. The same
code works against any Postgres that exposes the qiita schema.

Replaces the previous `qiita_db.sql_connection.TRN` import, which pulled in
the full Qiita conda environment (redis, qiita_core, et al.) just to issue
a few SELECTs. This module now needs only psycopg2.
"""
import os

import psycopg2
import psycopg2.extras


def _connect():
    """Open a fresh connection per request.

    Lazy so module import is side-effect free -- tests can import this
    file without a Postgres reachable, as long as they do not call into
    a function that opens a connection.
    """
    password = os.environ.get("PG_PASSWORD")
    if not password:
        raise RuntimeError(
            "PG_PASSWORD is not set. Configure it in backend/.env "
            "(see .env.example)."
        )
    return psycopg2.connect(
        host=os.environ.get("PG_HOST", "localhost"),
        port=int(os.environ.get("PG_PORT", "5432")),
        dbname=os.environ.get("PG_DATABASE", "qiita_test"),
        user=os.environ.get("PG_USER", "postgres"),
        password=password,
    )


def search_studies_with_sql(custom_sql_where="", params=None, limit=50):
    """
    Search studies using custom SQL WHERE clause

    Parameters
    ----------
    custom_sql_where : str
        Custom WHERE clause (without the WHERE keyword). Parameter
        placeholders are psycopg2's %s, same as the previous TRN API.
    params : list
        Parameters bound into the WHERE clause.
    limit : int
        Max rows (clamped 1-200).

    Returns
    -------
    list
        List of dictionaries with study information.
    """
    if params is None:
        params = []
    try:
        lim = int(limit)
    except (TypeError, ValueError):
        lim = 50
    lim = max(1, min(200, lim))

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
    WHERE v.visibility = 'public'
      AND ({custom_sql_where if custom_sql_where else '1=1'})
    ORDER BY s.study_id
    LIMIT {lim}
    """

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    if not rows:
        return []

    return [
        {
            'study_id': r[0],
            'study_title': r[1],
            'study_abstract': r[2],
            'study_alias': r[3],
            'metadata_complete': r[4],
            'pi_name': r[5],
            'pi_email': r[6],
            'pi_affiliation': r[7],
            'lab_person_name': r[8],
            'num_samples': r[9],
            'data_types': r[10],
            'num_preps': r[11],
        }
        for r in rows
    ]
