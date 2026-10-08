# Backend CI activation

`wms_backend` is not currently a Git repository, so GitHub cannot discover or
run `ci.yml` yet. The workflow is intentionally present for the owner to keep
when they initialize this directory as a repository; this task does not run
`git init`.

The workflow uses Node 22 and a PostgreSQL 18 service. Before activation, make
the `@wms/domain` file dependency available beside the backend checkout (or
publish/replace that dependency), because the current package manifest refers
to `file:../wms_domain`.
