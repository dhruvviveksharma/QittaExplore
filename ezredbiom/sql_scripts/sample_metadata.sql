SELECT
    ss.sample_id,
    s.sample_values->>'anonymized_name'       AS name,
    s.sample_values->>'common_name'           AS common_name,
    s.sample_values->>'collection_timestamp'  AS collected,
    s.sample_values->>'env_package'           AS env_package,
    s.sample_values->>'ph'                    AS ph
FROM qiita.study_sample ss
JOIN qiita.sample_1 s ON ss.sample_id = s.sample_id  -- ← swap to sample_{study_id}
WHERE ss.study_id = 1                                  -- ← change this
  AND ss.sample_id <> 'qiita_sample_column_names'
ORDER BY ss.sample_id;
