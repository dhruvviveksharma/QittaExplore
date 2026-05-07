SELECT
    pt.prep_template_id,
    pt.name            AS prep_name,
    dt.data_type,
    pt.investigation_type,
    pt.preprocessing_status,
    pt.creation_timestamp,
    pt.modification_timestamp
FROM qiita.study_prep_template spt
JOIN qiita.prep_template pt ON spt.prep_template_id = pt.prep_template_id
JOIN qiita.data_type     dt ON pt.data_type_id = dt.data_type_id
WHERE spt.study_id = 1  -- ← change this
ORDER BY pt.prep_template_id;

