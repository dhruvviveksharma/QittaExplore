SELECT
    pt.prep_template_id,
    pt.name            AS prep_name,
    a.artifact_id,
    at.artifact_type,
    dt.data_type,
    dd.mountpoint || '/' || a.artifact_id || '/' || f.filepath AS full_path,
    a.generated_timestamp
FROM qiita.study_prep_template  spt
JOIN qiita.prep_template         pt  ON spt.prep_template_id = pt.prep_template_id
JOIN qiita.data_type             dt  ON pt.data_type_id = dt.data_type_id
JOIN qiita.preparation_artifact  pa  ON pt.prep_template_id = pa.prep_template_id
JOIN qiita.artifact              a   ON pa.artifact_id = a.artifact_id
JOIN qiita.artifact_type         at  ON a.artifact_type_id = at.artifact_type_id
JOIN qiita.artifact_filepath     af  ON a.artifact_id = af.artifact_id
JOIN qiita.filepath              f   ON af.filepath_id = f.filepath_id
JOIN qiita.data_directory        dd  ON f.data_directory_id = dd.data_directory_id
WHERE spt.study_id = 1  -- ← change this
ORDER BY pt.prep_template_id, a.artifact_id;
