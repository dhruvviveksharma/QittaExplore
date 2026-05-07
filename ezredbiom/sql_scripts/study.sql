SELECT
    study_id,
    study_title,
    study_alias,
    study_description,
    email,
    metadata_complete,
    autoloaded
FROM qiita.study
WHERE study_id = 1;  -- ← change this
