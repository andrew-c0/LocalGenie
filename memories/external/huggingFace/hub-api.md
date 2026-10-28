# Hub API Endpoints

We have open endpoints that you can use to retrieve information from the Hub as well as perform certain actions such as creating model, dataset or Space repos. We offer a wrapper Python client, [`huggingface_hub`](https://github.com/huggingface/huggingface_hub), and a JS client, [`huggingface.js`](https://github.com/huggingface/huggingface.js), that allow easy access to these endpoints. We also provide [webhooks](https://huggingface.co/docs/hub/webhooks) to receive real-time incremental info about repos. Enjoy!

The base URL for those endpoints below is `https://huggingface.co`. For example, to construct the `/api/models` call below, one can call the URL [https://huggingface.co/api/models](https://huggingface.co/api/models).

If you're an Agent, you might prefer the [markdown version OpenAPI spec](https://huggingface.co/.well-known/openapi.md).


**Base URL:** `https://huggingface.co`

## Auth

The following endpoints get information about your currently used user based on the passed token.

### GET /api/whoami-v2

**Get user info**

Get information about the user and auth method used

**Responses:**

- **200**: Auth information

## Models

Get information from all models on the Hub.

### GET /api/models/{namespace}/{repo}/likers

**List likers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| expand | query | array | No |  |

### GET /api/models/{namespace}/{repo}/treesize/{rev}/{path}

**Get folder size**

Get the total size of a repository at a given revision, optionally under a specific subpath. Returns the total size in bytes of all files under the specified path (recursively). If a file is stored via Xet/LFS, the LFS file size is used.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Total size of a repository at a given revision, under the given path

### GET /api/models/{namespace}/{repo}/safetensors-metadata/{path}

**Get safetensors metadata**

Get the parsed headers of all the shards of a sharded safetensors model in a single request, instead of reading the index and then the header of every shard.

Only the `main` revision is served: the `ETag` is the commit sha of `main`, and requests with a matching `If-None-Match` get a 304. Returns 400 when the path isn't a `.safetensors.index.json` file and 422 when the files can't be parsed.

The response is brotli-compressed when the client accepts it, otherwise gzip-compressed or plain JSON.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Parsed headers of the shards of a sharded safetensors model

### GET /api/models/{namespace}/{repo}/lfs-files

**List Large files**

List Xet/LFS files for a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| cursor | query | string | No |  |
| direction | query | string | No |  |
| limit | query | integer | No |  |
| sort | query | string | No |  |
| xet | query | string | No |  |

**Responses:**

- **200**: List of Xet/LFS files for the repo

### POST /api/models/{namespace}/{repo}/lfs-files/batch

**Delete Large files**

Delete Xet/LFS files in batch

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deletions": {
      "type": "object",
      "properties": {
        "sha": {
          "minItems": 1,
          "maxItems": 1000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rewriteHistory": {
          "default": true,
          "type": "boolean"
        }
      },
      "required": [
        "sha"
      ]
    }
  },
  "required": [
    "deletions"
  ]
}
```

### DELETE /api/models/{namespace}/{repo}/lfs-files/{sha}

**Delete Large file**

Delete a Xet/LFS file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| sha | path | string | Yes |  |
| rewriteHistory | query | string | No |  |

### POST /api/models/{namespace}/{repo}/lfs-files/duplicate

**Duplicate xet files**

Duplicate xet-stored files from this repo (source) into another repo (target) by xet hash, without re-uploading file bytes. The caller must then commit the files with their sha256/size as usual.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "target": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "model",
            "space",
            "dataset",
            "kernel"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "type",
        "name"
      ]
    },
    "files": {
      "minItems": 1,
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "xetHash": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "sha256": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "filename": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "xetHash",
          "sha256"
        ]
      }
    }
  },
  "required": [
    "target",
    "files"
  ]
}
```

**Responses:**

- **200**: Duplicate xet files response
- **207**: Duplicate xet files response

### GET /api/models/{namespace}/{repo}/commits/{rev}

**List commits**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| p | query | integer | No |  |
| expand | query | array | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Commits list

### GET /api/models/{namespace}/{repo}/refs

**List references**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| include_prs | query | string | No |  |

**Responses:**

- **200**: List of references in the repository

### GET /api/models/{namespace}/{repo}/compare/{compare}

**Get compare rev**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| compare | path | string | Yes |  |
| raw | query | string | No |  |

**Responses:**

- **200**: The diff between the two revisions

### POST /api/models/{namespace}/{repo}/paths-info/{rev}

**List paths info**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paths": {
      "anyOf": [
        {
          "maxItems": 2000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "string"
        }
      ]
    },
    "expand": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "default": false,
          "type": "boolean"
        }
      ],
      "description": "Expand the response with the last commit and security file status"
    }
  },
  "required": [
    "paths"
  ]
}
```

**Responses:**

- **200**: List of paths in the repository

### POST /api/models/{namespace}/{repo}/preupload/{rev}

**Check upload method**

Check if a file should be uploaded through the Large File mechanism or directly.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "files": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string"
          },
          "size": {
            "type": "number"
          },
          "sample": {
            "type": "string"
          }
        },
        "required": [
          "path",
          "size",
          "sample"
        ]
      }
    },
    "gitAttributes": {
      "description": "Provide this parameter if you plan to modify `.gitattributes` yourself at the same time as uploading LFS files. Note that this is not needed if you solely rely on automatic LFS detection from HF: the commit endpoint will automatically edit the `.gitattributes` file to track the files passed to its `lfsFiles` param.",
      "type": "string"
    },
    "gitIgnore": {
      "description": "Content of the .gitignore file for the revision. Optional, otherwise takes the existing content of `.gitignore` for the revision.",
      "type": "string"
    }
  },
  "required": [
    "files"
  ]
}
```

**Responses:**

- **200**: Files to be uploaded.
- **422**: The request is invalid

### GET /api/models/{namespace}/{repo}/xet-write-token/{rev}

**Xet write token**

Get a write short-lived access token for XET upload

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetWriteAccessToken endpoint.

### GET /api/models/{namespace}/{repo}/xet-read-token/{rev}

**Xet read token**

Get a read short-lived access token for XET

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetReadAccessToken endpoint.

### POST /api/models/{namespace}/{repo}/commit/{rev}

**Commit**

For legacy reason, we support both `application/json` and `application/x-ndjson` but we recommend using `application/x-ndjson` to create a commit.

JSON-lines payload:
```json
{
  "key": "header",
  "value": {
    "summary": "string (REQUIRED)",
    "description": "string (OPTIONAL - defaults to empty string)",
    "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  }
}
{
  "key": "file",
  "value": {
    "path": "string (REQUIRED)",
    "content": "string (OPTIONAL - required if oldPath not set)",
    "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
{
  "key": "deletedEntry",
  "value": {
    "path": "string (REQUIRED)"
  }
}
{
  "key": "lfsFile",
  "value": {
    "path": "string (REQUIRED - max 1000 chars)",
    "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
    "algo": "sha256 (OPTIONAL - only sha256 supported)",
    "size": "number (OPTIONAL - required if oldPath is set)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
```

JSON payload:
```json
{
  "summary": "string (REQUIRED)",
  "description": "string (OPTIONAL - defaults to empty string)",
  "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  "files": [
    {
      "path": "string (REQUIRED)",
      "content": "string (OPTIONAL - required if oldPath not set)",
      "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ],
  "deletedEntries": [
    {
      "path": "string (REQUIRED)"
    }
  ],
  "lfsFiles": [
    {
      "path": "string (REQUIRED - max 1000 chars)",
      "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
      "algo": "sha256 (OPTIONAL - only sha256 supported)",
      "size": "number (OPTIONAL - required if oldPath is set)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ]
}
```


**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| create_pr | query | string | No | Whether to create a pull request from the commit |
| hot_reload | query | string | No | For Spaces, whether to try to hot reload the commit (only for single python files updates) |
| Content-Type | header | string | No | `application/x-ndjson` if you to commit by json lines |

**Responses:**

- **200**: The response of the commit

### POST /api/models/{namespace}/{repo}/tag/{rev}

**Create tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tag": {
      "type": "string"
    },
    "message": {
      "type": "string"
    }
  },
  "required": [
    "tag"
  ]
}
```

### DELETE /api/models/{namespace}/{repo}/tag/{rev}

**Delete a tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/models/{namespace}/{repo}/branch/{rev}

**Create branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "startingPoint": {
      "description": "The commit to start from",
      "type": "string"
    },
    "emptyBranch": {
      "default": false,
      "description": "Create an empty branch",
      "type": "boolean"
    },
    "overwrite": {
      "default": false,
      "description": "Overwrite the branch if it already exists",
      "type": "boolean"
    }
  }
}
```

### DELETE /api/models/{namespace}/{repo}/branch/{rev}

**Delete a branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/models/{namespace}/{repo}/resource-group

**Add resource group**

Add the repository to a resource group

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to add the repository to, if null, the repository will be removed from the resource group"
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the repository

### GET /api/models/{namespace}/{repo}/resource-group

**Get resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The resource group of the repository

### POST /api/models/{namespace}/{repo}/super-squash/{rev}

**Squash ref**

Squash all commits in the current ref into a single commit with the given message. Action is irreversible.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```

**Responses:**

- **200**: Response containing the new commit ID after the squash

### PUT /api/models/{namespace}/{repo}/settings

**Update repo settings**

Update the settings of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "type": "boolean"
    },
    "visibility": {
      "description": "Repository visibility. `protected` is only supported for Spaces.",
      "type": "string",
      "enum": [
        "private",
        "public",
        "protected"
      ]
    },
    "discussionsDisabled": {
      "type": "boolean"
    },
    "discussionsSorting": {
      "type": "string",
      "enum": [
        "recently-created",
        "trending",
        "reactions"
      ]
    },
    "gated": {
      "anyOf": [
        {
          "type": "boolean",
          "const": false
        },
        {
          "type": "string",
          "enum": [
            "auto",
            "manual"
          ]
        }
      ]
    },
    "orgMembersGated": {
      "description": "If true, members of the owning org (except admins) must also go through the gated access-request flow.",
      "type": "boolean"
    },
    "gatedProfileSharing": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": true
            },
            "email": {
              "type": "boolean"
            }
          },
          "required": [
            "username",
            "email"
          ]
        },
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": false
            },
            "email": {
              "type": "boolean",
              "const": false
            }
          },
          "required": [
            "username",
            "email"
          ]
        }
      ],
      "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
    },
    "gatedNotificationsEmail": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "gatedNotificationsMode": {
      "type": "string",
      "enum": [
        "bulk",
        "real-time"
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated repo settings.

### GET /api/models/{namespace}/{repo}/tree/{rev}/{path}

**List folder content**

List the content of a repository tree, with pagination support.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| expand | query | string | No | If true, returns returns associated commit data for each entry and security scanner metadata. |
| recursive | query | string | No | If true, returns the tree recursively. |
| limit | query | integer | No | 1.000 by default, 100 by default for expand=true |
| cursor | query | string | No |  |

**Responses:**

- **200**: List of entries in the repository tree

### GET /api/models/{namespace}/{repo}/notebook/{rev}/{path}

**Get notebook URL**

Get a jupyter notebook URL for the requested file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Response containing the url of the notebook

### GET /api/models/{namespace}/{repo}/scan

**Get security status**

Get the security status of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The security status of the repo

### GET /api/models/{namespace}/{repo}/jwt

**Generate JWT**

Generate a JWT token for accessing a repository. Supports optional write access for spaces in dev mode, custom expiration, and encryption.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| write | query | string | No |  |
| expiration | query | string | No | Requested expiration datetime, capped at the default (10 minutes with write, 24 hours for spaces, 1 hour otherwise). Use expires_in instead. |
| expires_in | query | integer | No | Requested lifetime in seconds, capped at the default (600s with write, 86400s for spaces, 3600s otherwise) |
| encrypted | query | string | No |  |
| inference_api | query | string | No |  |
| include_pro_status | query | string | No | Use billing_details instead. |
| billing_details | query | string | No |  |

**Responses:**

- **200**: The JWT token and related information

### GET /api/models-tags-by-type

**Get model tags**

Get all possible tags used for models, grouped by tag type. Optionally restrict to only one tag type

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| type | query | string | No |  |

**Responses:**

- **200**: The tags, grouped by tag type

### GET /api/trending

**Get trending**

Get the trending repositories

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| type | query | string | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Trending repos

### GET /{namespace}/{repo}/resolve/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### GET /api/resolve-cache/models/{namespace}/{repo}/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### POST /{namespace}/{repo}/ask-access

**Request access**

Request access to a gated repository. The fields requested by repository card metadata (https://huggingface.co/docs/hub/en/models-gated#customize-requested-information)

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "propertyNames": {
    "type": "string"
  },
  "additionalProperties": {}
}
```

**Responses:**

- **303**: Redirection to the repo

### GET /{namespace}/{repo}/user-access-report

**Export access report**

Export a report of all access requests for a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The report of all access requests for a gated repository

### POST /api/models/{namespace}/{repo}/user-access-request/cancel

**Cancel access request**

Cancel the current user's access request to a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### GET /api/models/{namespace}/{repo}/user-access-request/{status}

**List access requests**

List access requests for a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| status | path | string | Yes |  |
| limit | query | integer | No |  |
| after | query | string | No |  |
| before | query | string | No |  |
| q | query | string | No | Search requests by requester username, fullname, email, email domain or verified organization |

**Responses:**

- **200**: List of access requests for the gated repository

### POST /api/models/{namespace}/{repo}/user-access-request/handle

**Handle access request**

Handle a user's access request to a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "requestId": {
          "description": "Id of the request as returned by the listing endpoint; the only identifier when the requester's profile is not shared",
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "status",
        "requestId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "userId": {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "status",
        "userId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "user": {
          "type": "string"
        }
      },
      "required": [
        "status",
        "user"
      ]
    }
  ]
}
```

### POST /api/models/{namespace}/{repo}/user-access-request/batch

**Batch access requests**

Accept, reject, reset or set back to pending up to 100 access requests for a single gated repository in one call. The same `status` (and optional `rejectionReason` or `resetReason`) is applied to every request in the list.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "accepted",
        "rejected",
        "pending",
        "reset"
      ]
    },
    "rejectionReason": {
      "type": "string",
      "maxLength": 200
    },
    "resetReason": {
      "type": "string",
      "maxLength": 200
    },
    "requests": {
      "minItems": 1,
      "maxItems": 100,
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "requestId": {
                "description": "Id of the request as returned by the listing endpoint; the only identifier when the requester's profile is not shared",
                "type": "string",
                "minLength": 24,
                "maxLength": 24,
                "pattern": "^[0-9a-fA-F]{24}$"
              }
            },
            "required": [
              "requestId"
            ]
          },
          {
            "type": "object",
            "properties": {
              "userId": {
                "type": "string",
                "minLength": 24,
                "maxLength": 24,
                "pattern": "^[0-9a-fA-F]{24}$"
              }
            },
            "required": [
              "userId"
            ]
          },
          {
            "type": "object",
            "properties": {
              "user": {
                "type": "string"
              }
            },
            "required": [
              "user"
            ]
          }
        ]
      }
    }
  },
  "required": [
    "status",
    "requests"
  ]
}
```

**Responses:**

- **200**: Per-request outcomes, in the same order as the input requests array.

### POST /api/models/{namespace}/{repo}/user-access-request/grant

**Grant access**

Grant access to a user for a gated repository.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "user": {
      "type": "string"
    }
  },
  "description": "The user to grant access to either by userId or user"
}
```

## Kernels

Get information from all kernels on the Hub.

### GET /api/kernels/{namespace}/{repo}/likers

**List likers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| expand | query | array | No |  |

### POST /api/kernels/{namespace}/{repo}/lfs-files/duplicate

**Duplicate xet files**

Duplicate xet-stored files from this repo (source) into another repo (target) by xet hash, without re-uploading file bytes. The caller must then commit the files with their sha256/size as usual.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "target": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "model",
            "space",
            "dataset",
            "kernel"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "type",
        "name"
      ]
    },
    "files": {
      "minItems": 1,
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "xetHash": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "sha256": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "filename": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "xetHash",
          "sha256"
        ]
      }
    }
  },
  "required": [
    "target",
    "files"
  ]
}
```

**Responses:**

- **200**: Duplicate xet files response
- **207**: Duplicate xet files response

### GET /api/kernels/{namespace}/{repo}/scan

**Get security status**

Get the security status of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The security status of the repo

### GET /api/kernels

**List kernels**

List kernels with optional filtering, sorting, and pagination

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| search | query | string | No | Filter by search term |
| author | query | string | No | Filter by author |
| id | query | string | No | Filter by ID |
| arxivIds | query | string | No | Filter by Arxiv ID |
| filter | query | string | No | Filter by tags |
| sort | query | string | No | Sort field (e.g. downloads, likes, lastModified, trendingScore) |
| direction | query | string | No | Sort direction: 1 for ascending, -1 for descending |
| limit | query | integer | No | Maximum number of results to return |
| cursor | query | string | No | Pagination cursor from Link header |
| full | query | boolean | No | Return full kernel info including author, sha, lastModified, files, gated |
| gated | query | boolean | No | Filter by gated |
| expand | query | string | No | Display specific fields in the response |

**Responses:**

- **200**: List of kernels

### GET /api/kernels/{namespace}/{repo}

**Get kernel**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Kernel overview information

### GET /api/kernels/{namespace}/{repo}/revision/{rev}

**Get kernel**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: Kernel overview information

### POST /api/kernels/access-request/approve

**Approve kernel access**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "namespace": {
      "type": "string",
      "minLength": 1
    },
    "sendEmail": {
      "type": "boolean"
    }
  },
  "required": [
    "namespace"
  ]
}
```

## Datasets

Get information from all datasets on the Hub.

### GET /api/datasets/{namespace}/{repo}/likers

**List likers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| expand | query | array | No |  |

### GET /api/datasets/{namespace}/{repo}/treesize/{rev}/{path}

**Get folder size**

Get the total size of a repository at a given revision, optionally under a specific subpath. Returns the total size in bytes of all files under the specified path (recursively). If a file is stored via Xet/LFS, the LFS file size is used.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Total size of a repository at a given revision, under the given path

### GET /api/datasets/{namespace}/{repo}/lfs-files

**List Large files**

List Xet/LFS files for a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| cursor | query | string | No |  |
| direction | query | string | No |  |
| limit | query | integer | No |  |
| sort | query | string | No |  |
| xet | query | string | No |  |

**Responses:**

- **200**: List of Xet/LFS files for the repo

### POST /api/datasets/{namespace}/{repo}/lfs-files/batch

**Delete Large files**

Delete Xet/LFS files in batch

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deletions": {
      "type": "object",
      "properties": {
        "sha": {
          "minItems": 1,
          "maxItems": 1000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rewriteHistory": {
          "default": true,
          "type": "boolean"
        }
      },
      "required": [
        "sha"
      ]
    }
  },
  "required": [
    "deletions"
  ]
}
```

### DELETE /api/datasets/{namespace}/{repo}/lfs-files/{sha}

**Delete Large file**

Delete a Xet/LFS file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| sha | path | string | Yes |  |
| rewriteHistory | query | string | No |  |

### POST /api/datasets/{namespace}/{repo}/lfs-files/duplicate

**Duplicate xet files**

Duplicate xet-stored files from this repo (source) into another repo (target) by xet hash, without re-uploading file bytes. The caller must then commit the files with their sha256/size as usual.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "target": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "model",
            "space",
            "dataset",
            "kernel"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "type",
        "name"
      ]
    },
    "files": {
      "minItems": 1,
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "xetHash": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "sha256": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "filename": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "xetHash",
          "sha256"
        ]
      }
    }
  },
  "required": [
    "target",
    "files"
  ]
}
```

**Responses:**

- **200**: Duplicate xet files response
- **207**: Duplicate xet files response

### GET /api/datasets/{namespace}/{repo}/commits/{rev}

**List commits**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| p | query | integer | No |  |
| expand | query | array | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Commits list

### GET /api/datasets/{namespace}/{repo}/refs

**List references**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| include_prs | query | string | No |  |

**Responses:**

- **200**: List of references in the repository

### GET /api/datasets/{namespace}/{repo}/compare/{compare}

**Get compare rev**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| compare | path | string | Yes |  |
| raw | query | string | No |  |

**Responses:**

- **200**: The diff between the two revisions

### POST /api/datasets/{namespace}/{repo}/paths-info/{rev}

**List paths info**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paths": {
      "anyOf": [
        {
          "maxItems": 2000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "string"
        }
      ]
    },
    "expand": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "default": false,
          "type": "boolean"
        }
      ],
      "description": "Expand the response with the last commit and security file status"
    }
  },
  "required": [
    "paths"
  ]
}
```

**Responses:**

- **200**: List of paths in the repository

### POST /api/datasets/{namespace}/{repo}/preupload/{rev}

**Check upload method**

Check if a file should be uploaded through the Large File mechanism or directly.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "files": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string"
          },
          "size": {
            "type": "number"
          },
          "sample": {
            "type": "string"
          }
        },
        "required": [
          "path",
          "size",
          "sample"
        ]
      }
    },
    "gitAttributes": {
      "description": "Provide this parameter if you plan to modify `.gitattributes` yourself at the same time as uploading LFS files. Note that this is not needed if you solely rely on automatic LFS detection from HF: the commit endpoint will automatically edit the `.gitattributes` file to track the files passed to its `lfsFiles` param.",
      "type": "string"
    },
    "gitIgnore": {
      "description": "Content of the .gitignore file for the revision. Optional, otherwise takes the existing content of `.gitignore` for the revision.",
      "type": "string"
    }
  },
  "required": [
    "files"
  ]
}
```

**Responses:**

- **200**: Files to be uploaded.
- **422**: The request is invalid

### GET /api/datasets/{namespace}/{repo}/xet-write-token/{rev}

**Xet write token**

Get a write short-lived access token for XET upload

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetWriteAccessToken endpoint.

### GET /api/datasets/{namespace}/{repo}/xet-read-token/{rev}

**Xet read token**

Get a read short-lived access token for XET

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetReadAccessToken endpoint.

### POST /api/datasets/{namespace}/{repo}/commit/{rev}

**Commit**

For legacy reason, we support both `application/json` and `application/x-ndjson` but we recommend using `application/x-ndjson` to create a commit.

JSON-lines payload:
```json
{
  "key": "header",
  "value": {
    "summary": "string (REQUIRED)",
    "description": "string (OPTIONAL - defaults to empty string)",
    "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  }
}
{
  "key": "file",
  "value": {
    "path": "string (REQUIRED)",
    "content": "string (OPTIONAL - required if oldPath not set)",
    "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
{
  "key": "deletedEntry",
  "value": {
    "path": "string (REQUIRED)"
  }
}
{
  "key": "lfsFile",
  "value": {
    "path": "string (REQUIRED - max 1000 chars)",
    "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
    "algo": "sha256 (OPTIONAL - only sha256 supported)",
    "size": "number (OPTIONAL - required if oldPath is set)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
```

JSON payload:
```json
{
  "summary": "string (REQUIRED)",
  "description": "string (OPTIONAL - defaults to empty string)",
  "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  "files": [
    {
      "path": "string (REQUIRED)",
      "content": "string (OPTIONAL - required if oldPath not set)",
      "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ],
  "deletedEntries": [
    {
      "path": "string (REQUIRED)"
    }
  ],
  "lfsFiles": [
    {
      "path": "string (REQUIRED - max 1000 chars)",
      "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
      "algo": "sha256 (OPTIONAL - only sha256 supported)",
      "size": "number (OPTIONAL - required if oldPath is set)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ]
}
```


**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| create_pr | query | string | No | Whether to create a pull request from the commit |
| hot_reload | query | string | No | For Spaces, whether to try to hot reload the commit (only for single python files updates) |
| Content-Type | header | string | No | `application/x-ndjson` if you to commit by json lines |

**Responses:**

- **200**: The response of the commit

### POST /api/datasets/{namespace}/{repo}/tag/{rev}

**Create tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tag": {
      "type": "string"
    },
    "message": {
      "type": "string"
    }
  },
  "required": [
    "tag"
  ]
}
```

### DELETE /api/datasets/{namespace}/{repo}/tag/{rev}

**Delete a tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/datasets/{namespace}/{repo}/branch/{rev}

**Create branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "startingPoint": {
      "description": "The commit to start from",
      "type": "string"
    },
    "emptyBranch": {
      "default": false,
      "description": "Create an empty branch",
      "type": "boolean"
    },
    "overwrite": {
      "default": false,
      "description": "Overwrite the branch if it already exists",
      "type": "boolean"
    }
  }
}
```

### DELETE /api/datasets/{namespace}/{repo}/branch/{rev}

**Delete a branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/datasets/{namespace}/{repo}/resource-group

**Add resource group**

Add the repository to a resource group

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to add the repository to, if null, the repository will be removed from the resource group"
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the repository

### GET /api/datasets/{namespace}/{repo}/resource-group

**Get resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The resource group of the repository

### POST /api/datasets/{namespace}/{repo}/super-squash/{rev}

**Squash ref**

Squash all commits in the current ref into a single commit with the given message. Action is irreversible.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```

**Responses:**

- **200**: Response containing the new commit ID after the squash

### PUT /api/datasets/{namespace}/{repo}/settings

**Update repo settings**

Update the settings of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "type": "boolean"
    },
    "visibility": {
      "description": "Repository visibility. `protected` is only supported for Spaces.",
      "type": "string",
      "enum": [
        "private",
        "public",
        "protected"
      ]
    },
    "discussionsDisabled": {
      "type": "boolean"
    },
    "discussionsSorting": {
      "type": "string",
      "enum": [
        "recently-created",
        "trending",
        "reactions"
      ]
    },
    "gated": {
      "anyOf": [
        {
          "type": "boolean",
          "const": false
        },
        {
          "type": "string",
          "enum": [
            "auto",
            "manual"
          ]
        }
      ]
    },
    "orgMembersGated": {
      "description": "If true, members of the owning org (except admins) must also go through the gated access-request flow.",
      "type": "boolean"
    },
    "gatedProfileSharing": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": true
            },
            "email": {
              "type": "boolean"
            }
          },
          "required": [
            "username",
            "email"
          ]
        },
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": false
            },
            "email": {
              "type": "boolean",
              "const": false
            }
          },
          "required": [
            "username",
            "email"
          ]
        }
      ],
      "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
    },
    "gatedNotificationsEmail": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "gatedNotificationsMode": {
      "type": "string",
      "enum": [
        "bulk",
        "real-time"
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated repo settings.

### GET /api/datasets/{namespace}/{repo}/tree/{rev}/{path}

**List folder content**

List the content of a repository tree, with pagination support.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| expand | query | string | No | If true, returns returns associated commit data for each entry and security scanner metadata. |
| recursive | query | string | No | If true, returns the tree recursively. |
| limit | query | integer | No | 1.000 by default, 100 by default for expand=true |
| cursor | query | string | No |  |

**Responses:**

- **200**: List of entries in the repository tree

### GET /api/datasets/{namespace}/{repo}/notebook/{rev}/{path}

**Get notebook URL**

Get a jupyter notebook URL for the requested file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Response containing the url of the notebook

### GET /api/datasets/{namespace}/{repo}/scan

**Get security status**

Get the security status of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The security status of the repo

### GET /api/datasets/{namespace}/{repo}/leaderboard

**Get dataset leaderboard**

Returns the evaluation results ranked by score for a dataset/task

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| task_id | query | string | No |  |
| max_params | query | string | No |  |
| base_model | query | string | No |  |

**Responses:**

- **200**: Evaluation results

### GET /api/datasets/{namespace}/{repo}/jwt

**Generate JWT**

Generate a JWT token for accessing a repository. Supports optional write access for spaces in dev mode, custom expiration, and encryption.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| write | query | string | No |  |
| expiration | query | string | No | Requested expiration datetime, capped at the default (10 minutes with write, 24 hours for spaces, 1 hour otherwise). Use expires_in instead. |
| expires_in | query | integer | No | Requested lifetime in seconds, capped at the default (600s with write, 86400s for spaces, 3600s otherwise) |
| encrypted | query | string | No |  |
| inference_api | query | string | No |  |
| include_pro_status | query | string | No | Use billing_details instead. |
| billing_details | query | string | No |  |

**Responses:**

- **200**: The JWT token and related information

### GET /api/datasets-tags-by-type

**Get dataset tags**

Get all possible tags used for datasets, grouped by tag type. Optionally restrict to only one tag type

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| type | query | string | No |  |

**Responses:**

- **200**: The tags, grouped by tag type

### GET /api/trending

**Get trending**

Get the trending repositories

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| type | query | string | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Trending repos

### GET /datasets/{namespace}/{repo}/resolve/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### GET /api/resolve-cache/datasets/{namespace}/{repo}/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### POST /datasets/{namespace}/{repo}/ask-access

**Request access**

Request access to a gated repository. The fields requested by repository card metadata (https://huggingface.co/docs/hub/en/models-gated#customize-requested-information)

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "propertyNames": {
    "type": "string"
  },
  "additionalProperties": {}
}
```

**Responses:**

- **303**: Redirection to the repo

### GET /datasets/{namespace}/{repo}/user-access-report

**Export access report**

Export a report of all access requests for a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The report of all access requests for a gated repository

### POST /api/datasets/{namespace}/{repo}/user-access-request/cancel

**Cancel access request**

Cancel the current user's access request to a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### GET /api/datasets/{namespace}/{repo}/user-access-request/{status}

**List access requests**

List access requests for a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| status | path | string | Yes |  |
| limit | query | integer | No |  |
| after | query | string | No |  |
| before | query | string | No |  |
| q | query | string | No | Search requests by requester username, fullname, email, email domain or verified organization |

**Responses:**

- **200**: List of access requests for the gated repository

### POST /api/datasets/{namespace}/{repo}/user-access-request/handle

**Handle access request**

Handle a user's access request to a gated repository

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "requestId": {
          "description": "Id of the request as returned by the listing endpoint; the only identifier when the requester's profile is not shared",
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "status",
        "requestId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "userId": {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "status",
        "userId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "accepted",
            "rejected",
            "pending",
            "reset"
          ]
        },
        "rejectionReason": {
          "type": "string",
          "maxLength": 200
        },
        "resetReason": {
          "type": "string",
          "maxLength": 200
        },
        "user": {
          "type": "string"
        }
      },
      "required": [
        "status",
        "user"
      ]
    }
  ]
}
```

### POST /api/datasets/{namespace}/{repo}/user-access-request/batch

**Batch access requests**

Accept, reject, reset or set back to pending up to 100 access requests for a single gated repository in one call. The same `status` (and optional `rejectionReason` or `resetReason`) is applied to every request in the list.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "accepted",
        "rejected",
        "pending",
        "reset"
      ]
    },
    "rejectionReason": {
      "type": "string",
      "maxLength": 200
    },
    "resetReason": {
      "type": "string",
      "maxLength": 200
    },
    "requests": {
      "minItems": 1,
      "maxItems": 100,
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "requestId": {
                "description": "Id of the request as returned by the listing endpoint; the only identifier when the requester's profile is not shared",
                "type": "string",
                "minLength": 24,
                "maxLength": 24,
                "pattern": "^[0-9a-fA-F]{24}$"
              }
            },
            "required": [
              "requestId"
            ]
          },
          {
            "type": "object",
            "properties": {
              "userId": {
                "type": "string",
                "minLength": 24,
                "maxLength": 24,
                "pattern": "^[0-9a-fA-F]{24}$"
              }
            },
            "required": [
              "userId"
            ]
          },
          {
            "type": "object",
            "properties": {
              "user": {
                "type": "string"
              }
            },
            "required": [
              "user"
            ]
          }
        ]
      }
    }
  },
  "required": [
    "status",
    "requests"
  ]
}
```

**Responses:**

- **200**: Per-request outcomes, in the same order as the input requests array.

### POST /api/datasets/{namespace}/{repo}/user-access-request/grant

**Grant access**

Grant access to a user for a gated repository.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "user": {
      "type": "string"
    }
  },
  "description": "The user to grant access to either by userId or user"
}
```

## SQL Console

Get information from SQL Console embeds from a dataset.

### PATCH /api/{repoType}/{namespace}/{repo}/sql-console/embed/{id}

**Update embed**

Update SQL Console embed

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| id | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "maxLength": 200
    },
    "private": {
      "type": "boolean"
    },
    "sql": {
      "type": "string"
    }
  }
}
```

**Responses:**

- **200**: Updated SQL console embed

### DELETE /api/{repoType}/{namespace}/{repo}/sql-console/embed/{id}

**Delete embed**

Delete SQL Console embed

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| id | path | string | Yes |  |

**Responses:**

- **204**: SQL console embed deleted successfully

### POST /api/{repoType}/{namespace}/{repo}/sql-console/embed/{id}/hide

**Hide embed**

Hide a SQL Console embed from the dataset's community queries. Requires write access to the dataset.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| id | path | string | Yes |  |

**Responses:**

- **204**: SQL console embed hidden successfully

### POST /api/{repoType}/{namespace}/{repo}/sql-console/embed

**Create embed**

Create SQL Console embed

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sql": {
      "type": "string"
    },
    "title": {
      "type": "string",
      "maxLength": 200
    },
    "private": {
      "type": "boolean"
    },
    "views": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string"
          },
          "displayName": {
            "type": "string"
          },
          "viewName": {
            "type": "string"
          }
        },
        "required": [
          "key",
          "displayName",
          "viewName"
        ]
      }
    }
  },
  "required": [
    "sql",
    "title",
    "views"
  ]
}
```

**Responses:**

- **200**: Created SQL console embed

## Discussions

The following endpoints manage discussions.

### POST /api/blog/{slug}/comment

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/blog/{slug}/comment/{commentId}/reply

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/blog/{slug}/comment/{commentId}/reaction

**React to comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reaction": {
      "type": "string",
      "enum": [
        "🔥",
        "🚀",
        "👀",
        "❤️",
        "🤗",
        "😎",
        "➕",
        "🧠",
        "👍",
        "🤝",
        "😔",
        "🤯"
      ]
    },
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "reaction",
    "action"
  ]
}
```

### POST /api/blog/{slug}/comment/{commentId}/hide

**Hide comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "Spam",
        "Abuse",
        "Graphic Content",
        "Resolved",
        "Off-Topic",
        "Low Quality"
      ]
    }
  }
}
```

### POST /api/blog/{slug}/comment/{commentId}/edit

**Update a comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "content"
  ]
}
```

### POST /api/blog/{namespace}/{slug}/comment

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/blog/{namespace}/{slug}/comment/{commentId}/reply

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/blog/{namespace}/{slug}/comment/{commentId}/reaction

**React to comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reaction": {
      "type": "string",
      "enum": [
        "🔥",
        "🚀",
        "👀",
        "❤️",
        "🤗",
        "😎",
        "➕",
        "🧠",
        "👍",
        "🤝",
        "😔",
        "🤯"
      ]
    },
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "reaction",
    "action"
  ]
}
```

### POST /api/blog/{namespace}/{slug}/comment/{commentId}/hide

**Hide comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "Spam",
        "Abuse",
        "Graphic Content",
        "Resolved",
        "Off-Topic",
        "Low Quality"
      ]
    }
  }
}
```

### POST /api/blog/{namespace}/{slug}/comment/{commentId}/edit

**Update a comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "content"
  ]
}
```

### GET /api/{repoType}/{namespace}/{repo}/discussions

**List discussions**

Get discussions for a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| p | query | integer | No |  |
| type | query | string | No |  |
| status | query | string | No |  |
| author | query | string | No |  |
| search | query | string | No |  |
| sort | query | string | No |  |

**Responses:**

- **200**: List of discussions

### POST /api/{repoType}/{namespace}/{repo}/discussions

**Create discussion**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "minLength": 3,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "maxLength": 65536
    },
    "pullRequest": {
      "type": "boolean"
    }
  },
  "required": [
    "title",
    "description"
  ]
}
```

**Responses:**

- **200**: Discussion creation response

### GET /api/{repoType}/{namespace}/{repo}/discussions/{num}

**Get discussion details**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Responses:**

- **200**: Discussion details

### DELETE /api/{repoType}/{namespace}/{repo}/discussions/{num}

**Delete a discussion**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/comment

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/status

**Change status**

Change the status of a discussion

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "open",
        "closed"
      ]
    },
    "comment": {
      "type": "string"
    }
  },
  "required": [
    "status"
  ]
}
```

**Responses:**

- **200**: New status event

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/title

**Change title**

Change the title of a discussion

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "minLength": 3,
      "maxLength": 200
    }
  },
  "required": [
    "title"
  ]
}
```

**Responses:**

- **200**: New title event

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/pin

**Pin a discussion**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pinned": {
      "type": "boolean"
    }
  },
  "required": [
    "pinned"
  ]
}
```

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/merge

**Merge pull request**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string"
    }
  }
}
```

### DELETE /api/{repoType}/{namespace}/{repo}/discussions/{num}/ref

**Delete PR ref**

Deletes the git ref for a closed/merged pull request to free up storage. LFS files unique to this PR will be garbage collected. The PR page and diff will still be viewable using stored commit data.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

### GET /api/{repoType}/{namespace}/{repo}/discussions/{num}/storage

**PR storage estimate**

Estimates the LFS storage used by a PR that could be freed if the ref is deleted.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Responses:**

- **200**: PR storage estimate response

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/ignore

**Toggle ignore discussion**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "action"
  ]
}
```

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/comment/{commentId}/edit

**Update a comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "content"
  ]
}
```

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/comment/{commentId}/hide

**Hide comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "Spam",
        "Abuse",
        "Graphic Content",
        "Resolved",
        "Off-Topic",
        "Low Quality"
      ]
    }
  }
}
```

### POST /api/{repoType}/{namespace}/{repo}/discussions/{num}/comment/{commentId}/reaction

**React to comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| num | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reaction": {
      "type": "string",
      "enum": [
        "🔥",
        "🚀",
        "👀",
        "❤️",
        "🤗",
        "😎",
        "➕",
        "🧠",
        "👍",
        "🤝",
        "😔",
        "🤯"
      ]
    },
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "reaction",
    "action"
  ]
}
```

### POST /api/papers/{paperId}/comment

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/papers/{paperId}/comment/{commentId}/reply

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/papers/{paperId}/comment/{commentId}/edit

**Update a comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "content"
  ]
}
```

### POST /api/papers/{paperId}/comment/{commentId}/hide

**Hide comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "Spam",
        "Abuse",
        "Graphic Content",
        "Resolved",
        "Off-Topic",
        "Low Quality"
      ]
    }
  }
}
```

### POST /api/papers/{paperId}/comment/{commentId}/reaction

**React to comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reaction": {
      "type": "string",
      "enum": [
        "🔥",
        "🚀",
        "👀",
        "❤️",
        "🤗",
        "😎",
        "➕",
        "🧠",
        "👍",
        "🤝",
        "😔",
        "🤯"
      ]
    },
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "reaction",
    "action"
  ]
}
```

### DELETE /api/posts/{username}/{postSlug}

**Delete a discussion**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |

### POST /api/posts/{username}/{postSlug}/comment

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/posts/{username}/{postSlug}/comment/{commentId}/reply

**Create comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "comment": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "comment"
  ]
}
```

**Responses:**

- **201**: New comment created

### POST /api/posts/{username}/{postSlug}/comment/{commentId}/reaction

**React to comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reaction": {
      "type": "string",
      "enum": [
        "🔥",
        "🚀",
        "👀",
        "❤️",
        "🤗",
        "😎",
        "➕",
        "🧠",
        "👍",
        "🤝",
        "😔",
        "🤯"
      ]
    },
    "action": {
      "type": "string",
      "enum": [
        "add",
        "remove"
      ]
    }
  },
  "required": [
    "reaction",
    "action"
  ]
}
```

### POST /api/posts/{username}/{postSlug}/comment/{commentId}/hide

**Hide comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "Spam",
        "Abuse",
        "Graphic Content",
        "Resolved",
        "Off-Topic",
        "Low Quality"
      ]
    }
  }
}
```

### POST /api/posts/{username}/{postSlug}/comment/{commentId}/edit

**Update a comment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| postSlug | path | string | Yes |  |
| commentId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 65536
    }
  },
  "required": [
    "content"
  ]
}
```

## Spaces

Get information from all Spaces on the Hub.

### GET /api/spaces/{namespace}/{repo}/likers

**List likers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| expand | query | array | No |  |

### GET /api/spaces/{namespace}/{repo}/treesize/{rev}/{path}

**Get folder size**

Get the total size of a repository at a given revision, optionally under a specific subpath. Returns the total size in bytes of all files under the specified path (recursively). If a file is stored via Xet/LFS, the LFS file size is used.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Total size of a repository at a given revision, under the given path

### GET /api/spaces/{namespace}/{repo}/lfs-files

**List Large files**

List Xet/LFS files for a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| cursor | query | string | No |  |
| direction | query | string | No |  |
| limit | query | integer | No |  |
| sort | query | string | No |  |
| xet | query | string | No |  |

**Responses:**

- **200**: List of Xet/LFS files for the repo

### POST /api/spaces/{namespace}/{repo}/lfs-files/batch

**Delete Large files**

Delete Xet/LFS files in batch

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deletions": {
      "type": "object",
      "properties": {
        "sha": {
          "minItems": 1,
          "maxItems": 1000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rewriteHistory": {
          "default": true,
          "type": "boolean"
        }
      },
      "required": [
        "sha"
      ]
    }
  },
  "required": [
    "deletions"
  ]
}
```

### DELETE /api/spaces/{namespace}/{repo}/lfs-files/{sha}

**Delete Large file**

Delete a Xet/LFS file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| sha | path | string | Yes |  |
| rewriteHistory | query | string | No |  |

### POST /api/spaces/{namespace}/{repo}/lfs-files/duplicate

**Duplicate xet files**

Duplicate xet-stored files from this repo (source) into another repo (target) by xet hash, without re-uploading file bytes. The caller must then commit the files with their sha256/size as usual.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "target": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "model",
            "space",
            "dataset",
            "kernel"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "type",
        "name"
      ]
    },
    "files": {
      "minItems": 1,
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "xetHash": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "sha256": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "filename": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "xetHash",
          "sha256"
        ]
      }
    }
  },
  "required": [
    "target",
    "files"
  ]
}
```

**Responses:**

- **200**: Duplicate xet files response
- **207**: Duplicate xet files response

### GET /api/spaces/{namespace}/{repo}/commits/{rev}

**List commits**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| p | query | integer | No |  |
| expand | query | array | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Commits list

### GET /api/spaces/{namespace}/{repo}/refs

**List references**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| include_prs | query | string | No |  |

**Responses:**

- **200**: List of references in the repository

### GET /api/spaces/{namespace}/{repo}/compare/{compare}

**Get compare rev**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| compare | path | string | Yes |  |
| raw | query | string | No |  |

**Responses:**

- **200**: The diff between the two revisions

### POST /api/spaces/{namespace}/{repo}/paths-info/{rev}

**List paths info**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paths": {
      "anyOf": [
        {
          "maxItems": 2000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "string"
        }
      ]
    },
    "expand": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "default": false,
          "type": "boolean"
        }
      ],
      "description": "Expand the response with the last commit and security file status"
    }
  },
  "required": [
    "paths"
  ]
}
```

**Responses:**

- **200**: List of paths in the repository

### POST /api/spaces/{namespace}/{repo}/preupload/{rev}

**Check upload method**

Check if a file should be uploaded through the Large File mechanism or directly.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "files": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string"
          },
          "size": {
            "type": "number"
          },
          "sample": {
            "type": "string"
          }
        },
        "required": [
          "path",
          "size",
          "sample"
        ]
      }
    },
    "gitAttributes": {
      "description": "Provide this parameter if you plan to modify `.gitattributes` yourself at the same time as uploading LFS files. Note that this is not needed if you solely rely on automatic LFS detection from HF: the commit endpoint will automatically edit the `.gitattributes` file to track the files passed to its `lfsFiles` param.",
      "type": "string"
    },
    "gitIgnore": {
      "description": "Content of the .gitignore file for the revision. Optional, otherwise takes the existing content of `.gitignore` for the revision.",
      "type": "string"
    }
  },
  "required": [
    "files"
  ]
}
```

**Responses:**

- **200**: Files to be uploaded.
- **422**: The request is invalid

### GET /api/spaces/{namespace}/{repo}/xet-write-token/{rev}

**Xet write token**

Get a write short-lived access token for XET upload

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetWriteAccessToken endpoint.

### GET /api/spaces/{namespace}/{repo}/xet-read-token/{rev}

**Xet read token**

Get a read short-lived access token for XET

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetReadAccessToken endpoint.

### POST /api/spaces/{namespace}/{repo}/commit/{rev}

**Commit**

For legacy reason, we support both `application/json` and `application/x-ndjson` but we recommend using `application/x-ndjson` to create a commit.

JSON-lines payload:
```json
{
  "key": "header",
  "value": {
    "summary": "string (REQUIRED)",
    "description": "string (OPTIONAL - defaults to empty string)",
    "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  }
}
{
  "key": "file",
  "value": {
    "path": "string (REQUIRED)",
    "content": "string (OPTIONAL - required if oldPath not set)",
    "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
{
  "key": "deletedEntry",
  "value": {
    "path": "string (REQUIRED)"
  }
}
{
  "key": "lfsFile",
  "value": {
    "path": "string (REQUIRED - max 1000 chars)",
    "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
    "algo": "sha256 (OPTIONAL - only sha256 supported)",
    "size": "number (OPTIONAL - required if oldPath is set)",
    "oldPath": "string (OPTIONAL - for move/rename operations)"
  }
}
```

JSON payload:
```json
{
  "summary": "string (REQUIRED)",
  "description": "string (OPTIONAL - defaults to empty string)",
  "parentCommit": "string (OPTIONAL - 40-character hex SHA)"
  "files": [
    {
      "path": "string (REQUIRED)",
      "content": "string (OPTIONAL - required if oldPath not set)",
      "encoding": "utf-8 | base64 (OPTIONAL - defaults to utf-8)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ],
  "deletedEntries": [
    {
      "path": "string (REQUIRED)"
    }
  ],
  "lfsFiles": [
    {
      "path": "string (REQUIRED - max 1000 chars)",
      "oid": "string (OPTIONAL - required if oldPath not set, 64 hex chars)",
      "algo": "sha256 (OPTIONAL - only sha256 supported)",
      "size": "number (OPTIONAL - required if oldPath is set)",
      "oldPath": "string (OPTIONAL - for move/rename operations)"
    }
  ]
}
```


**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| create_pr | query | string | No | Whether to create a pull request from the commit |
| hot_reload | query | string | No | For Spaces, whether to try to hot reload the commit (only for single python files updates) |
| Content-Type | header | string | No | `application/x-ndjson` if you to commit by json lines |

**Responses:**

- **200**: The response of the commit

### POST /api/spaces/{namespace}/{repo}/tag/{rev}

**Create tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tag": {
      "type": "string"
    },
    "message": {
      "type": "string"
    }
  },
  "required": [
    "tag"
  ]
}
```

### DELETE /api/spaces/{namespace}/{repo}/tag/{rev}

**Delete a tag**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/spaces/{namespace}/{repo}/branch/{rev}

**Create branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "startingPoint": {
      "description": "The commit to start from",
      "type": "string"
    },
    "emptyBranch": {
      "default": false,
      "description": "Create an empty branch",
      "type": "boolean"
    },
    "overwrite": {
      "default": false,
      "description": "Overwrite the branch if it already exists",
      "type": "boolean"
    }
  }
}
```

### DELETE /api/spaces/{namespace}/{repo}/branch/{rev}

**Delete a branch**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

### POST /api/spaces/{namespace}/{repo}/resource-group

**Add resource group**

Add the repository to a resource group

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to add the repository to, if null, the repository will be removed from the resource group"
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the repository

### GET /api/spaces/{namespace}/{repo}/resource-group

**Get resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The resource group of the repository

### POST /api/spaces/{namespace}/{repo}/super-squash/{rev}

**Squash ref**

Squash all commits in the current ref into a single commit with the given message. Action is irreversible.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```

**Responses:**

- **200**: Response containing the new commit ID after the squash

### PUT /api/spaces/{namespace}/{repo}/settings

**Update repo settings**

Update the settings of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "type": "boolean"
    },
    "visibility": {
      "description": "Repository visibility. `protected` is only supported for Spaces.",
      "type": "string",
      "enum": [
        "private",
        "public",
        "protected"
      ]
    },
    "discussionsDisabled": {
      "type": "boolean"
    },
    "discussionsSorting": {
      "type": "string",
      "enum": [
        "recently-created",
        "trending",
        "reactions"
      ]
    },
    "gated": {
      "anyOf": [
        {
          "type": "boolean",
          "const": false
        },
        {
          "type": "string",
          "enum": [
            "auto",
            "manual"
          ]
        }
      ]
    },
    "orgMembersGated": {
      "description": "If true, members of the owning org (except admins) must also go through the gated access-request flow.",
      "type": "boolean"
    },
    "gatedProfileSharing": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": true
            },
            "email": {
              "type": "boolean"
            }
          },
          "required": [
            "username",
            "email"
          ]
        },
        {
          "type": "object",
          "properties": {
            "username": {
              "type": "boolean",
              "const": false
            },
            "email": {
              "type": "boolean",
              "const": false
            }
          },
          "required": [
            "username",
            "email"
          ]
        }
      ],
      "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
    },
    "gatedNotificationsEmail": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "gatedNotificationsMode": {
      "type": "string",
      "enum": [
        "bulk",
        "real-time"
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated repo settings.

### GET /api/spaces/{namespace}/{repo}/tree/{rev}/{path}

**List folder content**

List the content of a repository tree, with pagination support.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| expand | query | string | No | If true, returns returns associated commit data for each entry and security scanner metadata. |
| recursive | query | string | No | If true, returns the tree recursively. |
| limit | query | integer | No | 1.000 by default, 100 by default for expand=true |
| cursor | query | string | No |  |

**Responses:**

- **200**: List of entries in the repository tree

### GET /api/spaces/{namespace}/{repo}/notebook/{rev}/{path}

**Get notebook URL**

Get a jupyter notebook URL for the requested file

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |

**Responses:**

- **200**: Response containing the url of the notebook

### GET /api/spaces/{namespace}/{repo}/scan

**Get security status**

Get the security status of a repo

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The security status of the repo

### GET /api/spaces/{namespace}/{repo}/jwt

**Generate JWT**

Generate a JWT token for accessing a repository. Supports optional write access for spaces in dev mode, custom expiration, and encryption.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| write | query | string | No |  |
| expiration | query | string | No | Requested expiration datetime, capped at the default (10 minutes with write, 24 hours for spaces, 1 hour otherwise). Use expires_in instead. |
| expires_in | query | integer | No | Requested lifetime in seconds, capped at the default (600s with write, 86400s for spaces, 3600s otherwise) |
| encrypted | query | string | No |  |
| inference_api | query | string | No |  |
| include_pro_status | query | string | No | Use billing_details instead. |
| billing_details | query | string | No |  |

**Responses:**

- **200**: The JWT token and related information

### GET /api/trending

**Get trending**

Get the trending repositories

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| type | query | string | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Trending repos

### GET /api/spaces/hardware

**List space hardware**

Get available space hardware

**Responses:**

- **200**: Available space hardware (public only)

### GET /api/spaces/templates

**List Space templates**

Returns the catalog of official Space templates. The `repoId` of a template can be passed as `template` when creating a Space through the create-repo endpoint.

**Responses:**

- **200**: The list of available Space templates.

### GET /api/spaces/zero-gpu/quota

**Get ZeroGPU quota**

Get the authenticated user's current ZeroGPU quota usage and limits

**Responses:**

- **200**: The authenticated user's current ZeroGPU quota usage and limits

### POST /api/spaces/{namespace}/{repo}/secrets

**Upsert secret**

Upsert Spaces's secret

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
    },
    "description": {
      "type": "string"
    },
    "value": {
      "default": "",
      "type": "string"
    }
  },
  "required": [
    "key"
  ]
}
```

### DELETE /api/spaces/{namespace}/{repo}/secrets

**Delete secret**

Delete Spaces's secret

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string"
    }
  },
  "required": [
    "key"
  ]
}
```

### GET /api/spaces/{namespace}/{repo}/secrets

**List secrets**

List a Space's secret keys. Values are never returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Secret keys indexed by name.

### POST /api/spaces/{namespace}/{repo}/variables

**Upsert variable**

Upsert Spaces's variable

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
    },
    "description": {
      "type": "string"
    },
    "value": {
      "default": "",
      "type": "string"
    }
  },
  "required": [
    "key"
  ]
}
```

### DELETE /api/spaces/{namespace}/{repo}/variables

**Delete variable**

Delete Spaces's variable

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string"
    }
  },
  "required": [
    "key"
  ]
}
```

### GET /api/spaces/{namespace}/{repo}/variables

**List variables**

List a Space's variables with their values.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Variables indexed by name

### GET /spaces/{namespace}/{repo}/resolve/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### GET /api/resolve-cache/spaces/{namespace}/{repo}/{rev}/{path}

**Resolve a file**

This endpoint requires to follow redirection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| rev | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| Range | header | string | No | The range in bytes of the file to download |
| Accept | header | string | No | Returns json information about the XET file info - if the file is a xet file |

**Responses:**

- **200**: The XET file info only available if the accept header is set to application/vnd.xet-fileinfo+json
- **302**: Redirection to file
- **304**: Not modified
- **307**: Redirection to Xet endpoint

### PUT /api/spaces/{namespace}/{repo}/volumes

**Set Space volumes**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "volumes": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "bucket",
              "model",
              "dataset",
              "space"
            ]
          },
          "source": {
            "type": "string",
            "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
          },
          "mountPath": {
            "type": "string",
            "format": "starts_with",
            "pattern": "^\\/.*",
            "description": "Mount path inside the container, e.g. '/data'"
          },
          "revision": {
            "description": "Git revision (only for repos, defaults to 'main')",
            "type": "string"
          },
          "readOnly": {
            "description": "Read-only mount (true for repos, false default for buckets)",
            "type": "boolean"
          },
          "path": {
            "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
            "type": "string"
          }
        },
        "required": [
          "type",
          "source",
          "mountPath"
        ]
      }
    }
  },
  "required": [
    "volumes"
  ]
}
```

### DELETE /api/spaces/{namespace}/{repo}/volumes

**Delete Space volumes**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### POST /api/spaces/{namespace}/{repo}/hardware

**Update hardware flavor**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "flavor": {
      "type": "string",
      "enum": [
        "cpu-basic",
        "cpu-upgrade",
        "cpu-performance",
        "cpu-xl",
        "sprx8",
        "zero-a10g",
        "t4-small",
        "t4-medium",
        "l4x1",
        "l4x4",
        "l40sx1",
        "l40sx4",
        "l40sx8",
        "a10g-small",
        "a10g-large",
        "a10g-largex2",
        "a10g-largex4",
        "a100-large",
        "a100x4",
        "a100x8",
        "h200",
        "h200x2",
        "h200x4",
        "h200x8",
        "rtx-pro-6000",
        "rtx-pro-6000x2",
        "rtx-pro-6000x4",
        "rtx-pro-6000x8",
        "inf2x6"
      ]
    },
    "sleepTimeSeconds": {
      "anyOf": [
        {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "number",
          "const": -1
        }
      ]
    }
  },
  "required": [
    "flavor"
  ]
}
```

### POST /api/spaces/{namespace}/{repo}/sleeptime

**Set sleep time**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "seconds": {
      "anyOf": [
        {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "number",
          "const": -1
        }
      ]
    }
  },
  "required": [
    "seconds"
  ]
}
```

### GET /api/spaces/{namespace}/{repo}/logs/{logType}

**Stream logs**

Get logs for a specific Space in a streaming fashion, with SSE protocol

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| logType | path | string | Yes |  |
| tail | query | integer | No | Maximum number of lines to return from the logs. |

### GET /api/spaces/{namespace}/{repo}/events

**Stream events**

Get status updates for a specific Space in a streaming fashion, with SSE protocol

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| session_uuid | query | string | No |  |

### GET /api/spaces/{namespace}/{repo}/metrics

**Stream metrics**

Get live metrics for a specific Space in a streaming fashion, with SSE protocol, such as current Zero-GPU usage

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### POST /api/spaces/{namespace}/{repo}/dev-mode

**Toggle dev mode**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean"
    }
  },
  "required": [
    "enabled"
  ]
}
```

### POST /api/spaces/{namespace}/{repo}/custom-domain

**Set custom domain**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "domain": {
      "type": "string",
      "pattern": "^([a-z0-9]+(-[a-z0-9_]+)*\\.)+[a-z]{2,}$"
    }
  },
  "required": [
    "domain"
  ]
}
```

### GET /api/spaces/semantic-search

**Semantic search**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | No |  |
| category | query | string | No |  |
| includeNonRunning | query | boolean | No |  |
| sdk | query | array | No |  |
| filter | query | array | No |  |
| agents | query | boolean | No |  |

### GET /api/spaces/featured

**Featured spaces**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| date | query | string | No |  |

## Repository Search

The following endpoints help get information about models, datasets, and Spaces stored on the Hub.

### GET /api/quicksearch

**Quick search**

Quick search for models, datasets, spaces, orgs, users, papers, collections, and buckets

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | No |  |
| limit | query | string | No |  |
| lang | query | string | No |  |
| library | query | string | No |  |
| type | query | string | No |  |
| orgsFilter | query | string | No |  |
| reposFilter | query | string | No |  |
| pipelines | query | string | No | Comma-separated or array of pipeline types |
| exclude | query | array | No | Array of excluded resources: spaces/repo, models/repo, datasets/repo, papers/paperId, collections/collectionId, users/username, orgs/orgName, buckets/bucketName, containers/containerName, kernels/repo, blog/blogSlug |
| namespace | query | string | No | Namespace to filter by |
| includeInvitees | query | boolean,string | No |  |
| repoName | query | string | No |  |
| repoType | query | string | No |  |
| discussionId | query | string | No |  |
| discussionCollectionName | query | string | No |  |
| spacesTags | query | array | No |  |

**Responses:**

- **200**: The quick search results

### POST /api/quicksearch

**Quick search**

Quick search for models, datasets, spaces, orgs, users, papers, collections, and buckets

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | No |  |
| limit | query | string | No |  |
| lang | query | string | No |  |
| library | query | string | No |  |
| type | query | string | No |  |
| orgsFilter | query | string | No |  |
| reposFilter | query | string | No |  |
| pipelines | query | string | No | Comma-separated or array of pipeline types |
| exclude | query | array | No | Array of excluded resources: spaces/repo, models/repo, datasets/repo, papers/paperId, collections/collectionId, users/username, orgs/orgName, buckets/bucketName, containers/containerName, kernels/repo, blog/blogSlug |
| namespace | query | string | No | Namespace to filter by |
| includeInvitees | query | boolean,string | No |  |
| repoName | query | string | No |  |
| repoType | query | string | No |  |
| discussionId | query | string | No |  |
| discussionCollectionName | query | string | No |  |
| spacesTags | query | array | No |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "q": {
      "default": "",
      "type": "string"
    },
    "limit": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 1,
          "maximum": 20
        },
        {
          "type": "integer",
          "minimum": 1,
          "maximum": 20
        }
      ]
    },
    "lang": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "aa",
            "ab",
            "ae",
            "af",
            "ak",
            "am",
            "an",
            "ar",
            "as",
            "av",
            "ay",
            "az",
            "ba",
            "be",
            "bg",
            "bh",
            "bi",
            "bm",
            "bn",
            "bo",
            "br",
            "bs",
            "ca",
            "ce",
            "ch",
            "co",
            "cr",
            "cs",
            "cu",
            "cv",
            "cy",
            "da",
            "de",
            "dv",
            "dz",
            "ee",
            "el",
            "en",
            "eo",
            "es",
            "et",
            "eu",
            "fa",
            "ff",
            "fi",
            "fj",
            "fo",
            "fr",
            "fy",
            "ga",
            "gd",
            "gl",
            "gn",
            "gu",
            "gv",
            "ha",
            "he",
            "hi",
            "ho",
            "hr",
            "ht",
            "hu",
            "hy",
            "hz",
            "ia",
            "id",
            "ie",
            "ig",
            "ii",
            "ik",
            "io",
            "is",
            "it",
            "iu",
            "ja",
            "jv",
            "ka",
            "kg",
            "ki",
            "kj",
            "kk",
            "kl",
            "km",
            "kn",
            "ko",
            "kr",
            "ks",
            "ku",
            "kv",
            "kw",
            "ky",
            "la",
            "lb",
            "lg",
            "li",
            "ln",
            "lo",
            "lt",
            "lu",
            "lv",
            "mg",
            "mh",
            "mi",
            "mk",
            "ml",
            "mn",
            "mr",
            "ms",
            "mt",
            "my",
            "na",
            "nb",
            "nd",
            "ne",
            "ng",
            "nl",
            "nn",
            "no",
            "nr",
            "nv",
            "ny",
            "oc",
            "oj",
            "om",
            "or",
            "os",
            "pa",
            "pi",
            "pl",
            "ps",
            "pt",
            "qu",
            "rm",
            "rn",
            "ro",
            "ru",
            "rw",
            "sa",
            "sc",
            "sd",
            "se",
            "sg",
            "si",
            "sk",
            "sl",
            "sm",
            "sn",
            "so",
            "sq",
            "sr",
            "ss",
            "st",
            "su",
            "sv",
            "sw",
            "ta",
            "te",
            "tg",
            "th",
            "ti",
            "tk",
            "tl",
            "tn",
            "to",
            "tr",
            "ts",
            "tt",
            "tw",
            "ty",
            "ug",
            "uk",
            "ur",
            "uz",
            "ve",
            "vi",
            "vo",
            "wa",
            "wo",
            "xh",
            "yi",
            "yo",
            "za",
            "zh",
            "zu"
          ]
        },
        {
          "type": "string"
        }
      ]
    },
    "library": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "aadya-neural",
            "acestep",
            "adapter-transformers",
            "allennlp",
            "aneforge",
            "anemoi",
            "araclip",
            "asimov",
            "aviation-ner",
            "asteroid",
            "audiocraft",
            "audioseal",
            "bagel-mot",
            "bboxmaskpose",
            "ben2",
            "bertopic",
            "big_vision",
            "bionemo",
            "birder",
            "birefnet",
            "bm25s",
            "boltzgen",
            "cancertathomev2",
            "cartesia_pytorch",
            "cartesia_mlx",
            "causilo",
            "ccpfn",
            "champ",
            "chatterbox",
            "chaossim",
            "chat_tts",
            "chexmix",
            "chronos-forecasting",
            "clara",
            "clipscope",
            "cloud-agents",
            "collectorvision",
            "colipri",
            "cosyvoice",
            "cotracker",
            "colpali",
            "comet",
            "cortiq",
            "cosmos",
            "cxr-foundation",
            "deepforest",
            "depth-anything-v2",
            "depth-pro",
            "derm-foundation",
            "describe-anything",
            "dia-tts",
            "dia2",
            "diff-interpretation-tuning",
            "diffree",
            "diffusers",
            "diffusionkit",
            "docking-at-home",
            "doctr",
            "drinkme",
            "edsnlp",
            "elm",
            "encoderfile",
            "ensomi",
            "espnet",
            "eupe",
            "fairseq",
            "fastai",
            "fastprint",
            "fasttext",
            "fixer",
            "flair",
            "flexray",
            "flextab",
            "fme",
            "gaussianformer",
            "gemma.cpp",
            "geometry-crafter",
            "gliformer",
            "gliner",
            "gliner2",
            "glm-tts",
            "glyph-byt5",
            "granite-library",
            "grok",
            "habibi-tts",
            "hallo",
            "minimax-h3",
            "mect",
            "hermes",
            "holomotion",
            "hezar",
            "htrflow",
            "hunyuan-dit",
            "hunyuan3d-2",
            "hunyuanworld-voyager",
            "hy-worldplay",
            "hy-world-2",
            "image-matching-models",
            "imstoucan",
            "index-tts",
            "infinitetalk",
            "infinite-you",
            "intellifold",
            "ising-decoding",
            "jev-style",
            "keras",
            "tf-keras",
            "keras-hub",
            "zeromodels",
            "kernels",
            "kimi-audio",
            "kittentts",
            "kronos",
            "k2",
            "lyra-2.0",
            "lagernvs",
            "laya",
            "ltx",
            "lightning-ir",
            "litert",
            "litert-lm",
            "lerobot",
            "lightglue",
            "liveportrait",
            "longcat-video-avatar-1.5",
            "llama-cpp-python",
            "mini-omni2",
            "mindspore",
            "magi-1",
            "magenta-realtime",
            "magenta-realtime-2",
            "mamba-ssm",
            "manas-1",
            "mars5-tts",
            "matanyone",
            "memra",
            "mesh-anything",
            "merlin",
            "medvae",
            "mflux",
            "microduck",
            "mitie",
            "ml-agents",
            "ml-sharp",
            "mlx",
            "mlx-image",
            "mlc-llm",
            "model2vec",
            "mobilint",
            "montreal-forced-aligner",
            "moshi",
            "mtvcraft",
            "multimolecule",
            "nemo",
            "ninfer",
            "nobg",
            "nv-medtech",
            "open-oasis",
            "open_clip",
            "openasr",
            "opendde",
            "openpeerllm",
            "open-sora",
            "outetts",
            "paddlenlp",
            "PaddleOCR",
            "peft",
            "perception-encoder",
            "phantom-wan",
            "piper",
            "pocket-tts",
            "pruna-ai",
            "pxia",
            "pyannote-audio",
            "py-feat",
            "pythae",
            "quantumpeer",
            "qwen3_tts",
            "recurrentgemma",
            "relik",
            "refiners",
            "renderformer",
            "reverb",
            "rkllm",
            "robo-orchard-lab",
            "routee-powertrain",
            "rwkv",
            "saelens",
            "sage-music",
            "scail-2",
            "sam2",
            "sam-3d-body",
            "sam-3d-objects",
            "same",
            "sample-factory",
            "sap-rpt-1-oss",
            "sapiens",
            "sapiens2",
            "seedvr",
            "self-forcing",
            "sentence-transformers",
            "setfit",
            "shadow",
            "sklearn",
            "spacy",
            "span-marker",
            "speechbrain",
            "ssr-speech",
            "stable-audio-3",
            "stable-audio-tools",
            "monkeyocr",
            "diffusion-single-file",
            "seed-story",
            "skala",
            "soloaudio",
            "songbloom",
            "stable-baselines3",
            "stanza",
            "supertonic",
            "swarmformer",
            "synthefy-migas",
            "f5-tts",
            "genmo",
            "tencent-song-generation",
            "tensorflowtts",
            "tensorrt",
            "tabpfn",
            "terratorch",
            "tic-clip",
            "timesfm",
            "timee-ts",
            "timm",
            "tirex",
            "tirex-2",
            "torchgeo",
            "transformers",
            "transformers.js",
            "trellis",
            "trellis2",
            "tunejury",
            "ultralytics",
            "univa",
            "uni-3dar",
            "unity-sentis",
            "sana",
            "videoprism",
            "vfi-mamba",
            "vismatch",
            "lvface",
            "voicecraft",
            "voxcpm",
            "vui",
            "vqweb",
            "vibevoice",
            "videox_fun",
            "wan2.2",
            "wham",
            "whisperkit",
            "yolov10",
            "yolov26",
            "zonos",
            "3dtopia-xl"
          ]
        },
        {
          "type": "string"
        }
      ]
    },
    "type": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "model",
              "dataset",
              "space",
              "org",
              "user",
              "paper",
              "collection",
              "bucket",
              "container",
              "kernel",
              "blog"
            ]
          }
        },
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      ]
    },
    "orgsFilter": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "own",
              "unwatched"
            ]
          }
        },
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      ]
    },
    "reposFilter": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "skip_disabled",
              "skip_gated",
              "own",
              "own_orgs",
              "granted_access"
            ]
          }
        },
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      ]
    },
    "pipelines": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "text-classification",
              "token-classification",
              "table-question-answering",
              "question-answering",
              "zero-shot-classification",
              "translation",
              "summarization",
              "feature-extraction",
              "text-generation",
              "fill-mask",
              "sentence-similarity",
              "text-to-speech",
              "text-to-audio",
              "automatic-speech-recognition",
              "audio-to-audio",
              "audio-classification",
              "audio-text-to-text",
              "voice-activity-detection",
              "depth-estimation",
              "image-classification",
              "object-detection",
              "image-segmentation",
              "text-to-image",
              "image-to-text",
              "image-to-image",
              "image-to-video",
              "unconditional-image-generation",
              "video-classification",
              "reinforcement-learning",
              "robotics",
              "tabular-classification",
              "tabular-regression",
              "tabular-to-text",
              "table-to-text",
              "multiple-choice",
              "text-ranking",
              "text-retrieval",
              "time-series-forecasting",
              "text-to-video",
              "image-text-to-text",
              "image-text-to-image",
              "image-text-to-video",
              "visual-question-answering",
              "document-question-answering",
              "zero-shot-image-classification",
              "graph-ml",
              "mask-generation",
              "zero-shot-object-detection",
              "text-to-3d",
              "image-to-3d",
              "image-feature-extraction",
              "video-text-to-text",
              "keypoint-detection",
              "visual-document-retrieval",
              "any-to-any",
              "video-to-video",
              "other"
            ]
          }
        },
        {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          ]
        }
      ],
      "description": "Comma-separated or array of pipeline types"
    },
    "exclude": {
      "description": "Array of excluded resources: spaces/repo, models/repo, datasets/repo, papers/paperId, collections/collectionId, users/username, orgs/orgName, buckets/bucketName, containers/containerName, kernels/repo, blog/blogSlug",
      "default": [],
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^(spaces|models|datasets|papers|collections|users|orgs|buckets|containers|kernels|blog)\\/.*"
      }
    },
    "namespace": {
      "description": "Namespace to filter by",
      "type": "string"
    },
    "includeInvitees": {
      "type": [
        "boolean",
        "string"
      ]
    },
    "repoName": {
      "type": "string"
    },
    "repoType": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "dataset",
            "model",
            "space",
            "bucket",
            "kernel",
            "container"
          ]
        },
        {
          "type": "string"
        }
      ]
    },
    "discussionId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "discussionCollectionName": {
      "type": "string"
    },
    "spacesTags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Responses:**

- **200**: The quick search results

### GET /api/search/full-text

**Full-text search**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | No |  |
| limit | query | integer | No |  |
| skip | query | integer | No |  |
| type | query | string | No |  |
| filter | query | string | No |  |

## Repositories

The following endpoints manage repository settings like creating and deleting a repository.

### POST /api/{repoType}/{namespace}/{repo}/duplicate

**Duplicate a repository**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "repository": {
      "type": "string"
    },
    "private": {
      "type": "boolean"
    },
    "visibility": {
      "type": "string",
      "enum": [
        "private",
        "public",
        "protected"
      ]
    },
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ]
    },
    "hardware": {
      "default": "",
      "type": "string",
      "enum": [
        "cpu-basic",
        "cpu-upgrade",
        "cpu-performance",
        "cpu-xl",
        "sprx8",
        "zero-a10g",
        "t4-small",
        "t4-medium",
        "l4x1",
        "l4x4",
        "l40sx1",
        "l40sx4",
        "l40sx8",
        "a10g-small",
        "a10g-large",
        "a10g-largex2",
        "a10g-largex4",
        "a100-large",
        "a100x4",
        "a100x8",
        "h200",
        "h200x2",
        "h200x4",
        "h200x8",
        "rtx-pro-6000",
        "rtx-pro-6000x2",
        "rtx-pro-6000x4",
        "rtx-pro-6000x8",
        "inf2x6",
        ""
      ]
    },
    "sleepTimeSeconds": {
      "anyOf": [
        {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "number",
          "const": -1
        }
      ]
    },
    "secrets": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
          },
          "description": {
            "type": "string"
          },
          "value": {
            "type": "string"
          }
        },
        "required": [
          "key",
          "value"
        ]
      }
    },
    "variables": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
          },
          "description": {
            "type": "string"
          },
          "value": {
            "type": "string"
          }
        },
        "required": [
          "key",
          "value"
        ]
      }
    },
    "volumes": {
      "description": "HuggingFace Buckets or Repos to mount as volumes in the duplicated Space.",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "bucket",
              "model",
              "dataset",
              "space"
            ]
          },
          "source": {
            "type": "string",
            "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
          },
          "mountPath": {
            "type": "string",
            "format": "starts_with",
            "pattern": "^\\/.*",
            "description": "Mount path inside the container, e.g. '/data'"
          },
          "revision": {
            "description": "Git revision (only for repos, defaults to 'main')",
            "type": "string"
          },
          "readOnly": {
            "description": "Read-only mount (true for repos, false default for buckets)",
            "type": "boolean"
          },
          "path": {
            "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
            "type": "string"
          }
        },
        "required": [
          "type",
          "source",
          "mountPath"
        ]
      }
    }
  },
  "required": [
    "repository"
  ]
}
```

**Responses:**

- **200**: Repository created, url is given

### GET /api/{repoType}/{namespace}/{repo}/duplicate/status

**Duplication status**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| repoType | path | string | Yes |  |
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Progress of the background LFS/Xet copy of a duplicated repository

### POST /api/repos/create

**Create repository**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "organization": {
          "type": [
            "string",
            "null"
          ]
        },
        "region": {
          "description": "The region where the repository is hosted.",
          "type": "string",
          "enum": [
            "us",
            "eu"
          ]
        },
        "license": {
          "description": "The license of the repository. You can select 'Other' if your license is not in the list",
          "type": "string",
          "enum": [
            "apache-2.0",
            "mit",
            "openrail",
            "bigscience-openrail-m",
            "creativeml-openrail-m",
            "bigscience-bloom-rail-1.0",
            "bigcode-openrail-m",
            "afl-3.0",
            "artistic-2.0",
            "bsl-1.0",
            "bsd",
            "bsd-2-clause",
            "bsd-3-clause",
            "bsd-3-clause-clear",
            "c-uda",
            "cc",
            "cc0-1.0",
            "cc-by-2.0",
            "cc-by-2.5",
            "cc-by-3.0",
            "cc-by-4.0",
            "cc-by-sa-3.0",
            "cc-by-sa-4.0",
            "cc-by-nc-2.0",
            "cc-by-nc-3.0",
            "cc-by-nc-4.0",
            "cc-by-nd-4.0",
            "cc-by-nc-nd-3.0",
            "cc-by-nc-nd-4.0",
            "cc-by-nc-sa-2.0",
            "cc-by-nc-sa-3.0",
            "cc-by-nc-sa-4.0",
            "cdla-sharing-1.0",
            "cdla-permissive-1.0",
            "cdla-permissive-2.0",
            "wtfpl",
            "ecl-2.0",
            "epl-1.0",
            "epl-2.0",
            "etalab-2.0",
            "eupl-1.1",
            "eupl-1.2",
            "agpl-3.0",
            "gfdl",
            "gpl",
            "gpl-2.0",
            "gpl-3.0",
            "lgpl",
            "lgpl-2.1",
            "lgpl-3.0",
            "isc",
            "h-research",
            "intel-research",
            "lppl-1.3c",
            "ms-pl",
            "apple-ascl",
            "apple-amlr",
            "mpl-2.0",
            "odc-by",
            "odbl",
            "openmdw-1.0",
            "openmdw-1.1",
            "openrail++",
            "osl-3.0",
            "postgresql",
            "ofl-1.1",
            "ncsa",
            "unlicense",
            "zlib",
            "pddl",
            "lgpl-lr",
            "deepfloyd-if-license",
            "fair-noncommercial-research-license",
            "llama2",
            "llama3",
            "llama3.1",
            "llama3.2",
            "llama3.3",
            "llama4",
            "grok2-community",
            "gemma",
            "unknown",
            "other"
          ]
        },
        "license_name": {
          "type": "string",
          "pattern": "^[a-z0-9-.]+$"
        },
        "license_link": {
          "anyOf": [
            {
              "type": "string",
              "const": "LICENSE"
            },
            {
              "type": "string",
              "const": "LICENSE.md"
            },
            {
              "type": "string",
              "format": "uri"
            }
          ]
        },
        "private": {
          "description": "Repository visibility. Defaults to public. Cannot be specified along with visibility.",
          "type": [
            "boolean",
            "null"
          ]
        },
        "visibility": {
          "description": "Repository visibility. `protected` is only supported for Spaces. Cannot be specified along with private.",
          "type": "string",
          "enum": [
            "private",
            "public",
            "protected"
          ]
        },
        "resourceGroupId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "content": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "encoding": {
                "type": "string",
                "enum": [
                  "utf-8",
                  "base64"
                ]
              }
            },
            "required": [
              "content",
              "path"
            ]
          }
        },
        "type": {
          "type": "string",
          "const": "dataset"
        }
      },
      "required": [
        "name",
        "type"
      ]
    },
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "organization": {
          "type": [
            "string",
            "null"
          ]
        },
        "region": {
          "description": "The region where the repository is hosted.",
          "type": "string",
          "enum": [
            "us",
            "eu"
          ]
        },
        "license": {
          "description": "The license of the repository. You can select 'Other' if your license is not in the list",
          "type": "string",
          "enum": [
            "apache-2.0",
            "mit",
            "openrail",
            "bigscience-openrail-m",
            "creativeml-openrail-m",
            "bigscience-bloom-rail-1.0",
            "bigcode-openrail-m",
            "afl-3.0",
            "artistic-2.0",
            "bsl-1.0",
            "bsd",
            "bsd-2-clause",
            "bsd-3-clause",
            "bsd-3-clause-clear",
            "c-uda",
            "cc",
            "cc0-1.0",
            "cc-by-2.0",
            "cc-by-2.5",
            "cc-by-3.0",
            "cc-by-4.0",
            "cc-by-sa-3.0",
            "cc-by-sa-4.0",
            "cc-by-nc-2.0",
            "cc-by-nc-3.0",
            "cc-by-nc-4.0",
            "cc-by-nd-4.0",
            "cc-by-nc-nd-3.0",
            "cc-by-nc-nd-4.0",
            "cc-by-nc-sa-2.0",
            "cc-by-nc-sa-3.0",
            "cc-by-nc-sa-4.0",
            "cdla-sharing-1.0",
            "cdla-permissive-1.0",
            "cdla-permissive-2.0",
            "wtfpl",
            "ecl-2.0",
            "epl-1.0",
            "epl-2.0",
            "etalab-2.0",
            "eupl-1.1",
            "eupl-1.2",
            "agpl-3.0",
            "gfdl",
            "gpl",
            "gpl-2.0",
            "gpl-3.0",
            "lgpl",
            "lgpl-2.1",
            "lgpl-3.0",
            "isc",
            "h-research",
            "intel-research",
            "lppl-1.3c",
            "ms-pl",
            "apple-ascl",
            "apple-amlr",
            "mpl-2.0",
            "odc-by",
            "odbl",
            "openmdw-1.0",
            "openmdw-1.1",
            "openrail++",
            "osl-3.0",
            "postgresql",
            "ofl-1.1",
            "ncsa",
            "unlicense",
            "zlib",
            "pddl",
            "lgpl-lr",
            "deepfloyd-if-license",
            "fair-noncommercial-research-license",
            "llama2",
            "llama3",
            "llama3.1",
            "llama3.2",
            "llama3.3",
            "llama4",
            "grok2-community",
            "gemma",
            "unknown",
            "other"
          ]
        },
        "license_name": {
          "type": "string",
          "pattern": "^[a-z0-9-.]+$"
        },
        "license_link": {
          "anyOf": [
            {
              "type": "string",
              "const": "LICENSE"
            },
            {
              "type": "string",
              "const": "LICENSE.md"
            },
            {
              "type": "string",
              "format": "uri"
            }
          ]
        },
        "private": {
          "description": "Repository visibility. Defaults to public. Cannot be specified along with visibility.",
          "type": [
            "boolean",
            "null"
          ]
        },
        "visibility": {
          "description": "Repository visibility. `protected` is only supported for Spaces. Cannot be specified along with private.",
          "type": "string",
          "enum": [
            "private",
            "public",
            "protected"
          ]
        },
        "resourceGroupId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "content": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "encoding": {
                "type": "string",
                "enum": [
                  "utf-8",
                  "base64"
                ]
              }
            },
            "required": [
              "content",
              "path"
            ]
          }
        },
        "type": {
          "default": "model",
          "type": "string",
          "const": "model"
        }
      },
      "required": [
        "name"
      ]
    },
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "organization": {
          "type": [
            "string",
            "null"
          ]
        },
        "region": {
          "description": "The region where the repository is hosted.",
          "type": "string",
          "enum": [
            "us",
            "eu"
          ]
        },
        "license": {
          "description": "The license of the repository. You can select 'Other' if your license is not in the list",
          "type": "string",
          "enum": [
            "apache-2.0",
            "mit",
            "openrail",
            "bigscience-openrail-m",
            "creativeml-openrail-m",
            "bigscience-bloom-rail-1.0",
            "bigcode-openrail-m",
            "afl-3.0",
            "artistic-2.0",
            "bsl-1.0",
            "bsd",
            "bsd-2-clause",
            "bsd-3-clause",
            "bsd-3-clause-clear",
            "c-uda",
            "cc",
            "cc0-1.0",
            "cc-by-2.0",
            "cc-by-2.5",
            "cc-by-3.0",
            "cc-by-4.0",
            "cc-by-sa-3.0",
            "cc-by-sa-4.0",
            "cc-by-nc-2.0",
            "cc-by-nc-3.0",
            "cc-by-nc-4.0",
            "cc-by-nd-4.0",
            "cc-by-nc-nd-3.0",
            "cc-by-nc-nd-4.0",
            "cc-by-nc-sa-2.0",
            "cc-by-nc-sa-3.0",
            "cc-by-nc-sa-4.0",
            "cdla-sharing-1.0",
            "cdla-permissive-1.0",
            "cdla-permissive-2.0",
            "wtfpl",
            "ecl-2.0",
            "epl-1.0",
            "epl-2.0",
            "etalab-2.0",
            "eupl-1.1",
            "eupl-1.2",
            "agpl-3.0",
            "gfdl",
            "gpl",
            "gpl-2.0",
            "gpl-3.0",
            "lgpl",
            "lgpl-2.1",
            "lgpl-3.0",
            "isc",
            "h-research",
            "intel-research",
            "lppl-1.3c",
            "ms-pl",
            "apple-ascl",
            "apple-amlr",
            "mpl-2.0",
            "odc-by",
            "odbl",
            "openmdw-1.0",
            "openmdw-1.1",
            "openrail++",
            "osl-3.0",
            "postgresql",
            "ofl-1.1",
            "ncsa",
            "unlicense",
            "zlib",
            "pddl",
            "lgpl-lr",
            "deepfloyd-if-license",
            "fair-noncommercial-research-license",
            "llama2",
            "llama3",
            "llama3.1",
            "llama3.2",
            "llama3.3",
            "llama4",
            "grok2-community",
            "gemma",
            "unknown",
            "other"
          ]
        },
        "license_name": {
          "type": "string",
          "pattern": "^[a-z0-9-.]+$"
        },
        "license_link": {
          "anyOf": [
            {
              "type": "string",
              "const": "LICENSE"
            },
            {
              "type": "string",
              "const": "LICENSE.md"
            },
            {
              "type": "string",
              "format": "uri"
            }
          ]
        },
        "private": {
          "description": "Repository visibility. Defaults to public. Cannot be specified along with visibility.",
          "type": [
            "boolean",
            "null"
          ]
        },
        "visibility": {
          "description": "Repository visibility. `protected` is only supported for Spaces. Cannot be specified along with private.",
          "type": "string",
          "enum": [
            "private",
            "public",
            "protected"
          ]
        },
        "resourceGroupId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "content": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "encoding": {
                "type": "string",
                "enum": [
                  "utf-8",
                  "base64"
                ]
              }
            },
            "required": [
              "content",
              "path"
            ]
          }
        },
        "type": {
          "type": "string",
          "const": "kernel"
        }
      },
      "required": [
        "name",
        "type"
      ]
    },
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "organization": {
          "type": [
            "string",
            "null"
          ]
        },
        "region": {
          "description": "The region where the repository is hosted.",
          "type": "string",
          "enum": [
            "us",
            "eu"
          ]
        },
        "license": {
          "description": "The license of the repository. You can select 'Other' if your license is not in the list",
          "type": "string",
          "enum": [
            "apache-2.0",
            "mit",
            "openrail",
            "bigscience-openrail-m",
            "creativeml-openrail-m",
            "bigscience-bloom-rail-1.0",
            "bigcode-openrail-m",
            "afl-3.0",
            "artistic-2.0",
            "bsl-1.0",
            "bsd",
            "bsd-2-clause",
            "bsd-3-clause",
            "bsd-3-clause-clear",
            "c-uda",
            "cc",
            "cc0-1.0",
            "cc-by-2.0",
            "cc-by-2.5",
            "cc-by-3.0",
            "cc-by-4.0",
            "cc-by-sa-3.0",
            "cc-by-sa-4.0",
            "cc-by-nc-2.0",
            "cc-by-nc-3.0",
            "cc-by-nc-4.0",
            "cc-by-nd-4.0",
            "cc-by-nc-nd-3.0",
            "cc-by-nc-nd-4.0",
            "cc-by-nc-sa-2.0",
            "cc-by-nc-sa-3.0",
            "cc-by-nc-sa-4.0",
            "cdla-sharing-1.0",
            "cdla-permissive-1.0",
            "cdla-permissive-2.0",
            "wtfpl",
            "ecl-2.0",
            "epl-1.0",
            "epl-2.0",
            "etalab-2.0",
            "eupl-1.1",
            "eupl-1.2",
            "agpl-3.0",
            "gfdl",
            "gpl",
            "gpl-2.0",
            "gpl-3.0",
            "lgpl",
            "lgpl-2.1",
            "lgpl-3.0",
            "isc",
            "h-research",
            "intel-research",
            "lppl-1.3c",
            "ms-pl",
            "apple-ascl",
            "apple-amlr",
            "mpl-2.0",
            "odc-by",
            "odbl",
            "openmdw-1.0",
            "openmdw-1.1",
            "openrail++",
            "osl-3.0",
            "postgresql",
            "ofl-1.1",
            "ncsa",
            "unlicense",
            "zlib",
            "pddl",
            "lgpl-lr",
            "deepfloyd-if-license",
            "fair-noncommercial-research-license",
            "llama2",
            "llama3",
            "llama3.1",
            "llama3.2",
            "llama3.3",
            "llama4",
            "grok2-community",
            "gemma",
            "unknown",
            "other"
          ]
        },
        "license_name": {
          "type": "string",
          "pattern": "^[a-z0-9-.]+$"
        },
        "license_link": {
          "anyOf": [
            {
              "type": "string",
              "const": "LICENSE"
            },
            {
              "type": "string",
              "const": "LICENSE.md"
            },
            {
              "type": "string",
              "format": "uri"
            }
          ]
        },
        "private": {
          "description": "Repository visibility. Defaults to public. Cannot be specified along with visibility.",
          "type": [
            "boolean",
            "null"
          ]
        },
        "visibility": {
          "description": "Repository visibility. `protected` is only supported for Spaces. Cannot be specified along with private.",
          "type": "string",
          "enum": [
            "private",
            "public",
            "protected"
          ]
        },
        "resourceGroupId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "files": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "content": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "encoding": {
                "type": "string",
                "enum": [
                  "utf-8",
                  "base64"
                ]
              }
            },
            "required": [
              "content",
              "path"
            ]
          }
        },
        "type": {
          "type": "string",
          "const": "space"
        },
        "template": {
          "type": "string"
        },
        "short_description": {
          "type": "string",
          "maxLength": 60
        },
        "hardware": {
          "description": "The hardware flavor of the space. If you select 'zero-a10g' or 'zerogpu', the SDK must be Gradio.",
          "type": "string",
          "enum": [
            "cpu-basic",
            "cpu-upgrade",
            "cpu-performance",
            "cpu-xl",
            "sprx8",
            "zero-a10g",
            "t4-small",
            "t4-medium",
            "l4x1",
            "l4x4",
            "l40sx1",
            "l40sx4",
            "l40sx8",
            "a10g-small",
            "a10g-large",
            "a10g-largex2",
            "a10g-largex4",
            "a100-large",
            "a100x4",
            "a100x8",
            "h200",
            "h200x2",
            "h200x4",
            "h200x8",
            "rtx-pro-6000",
            "rtx-pro-6000x2",
            "rtx-pro-6000x4",
            "rtx-pro-6000x8",
            "inf2x6",
            "zerogpu"
          ]
        },
        "secrets": {
          "default": [],
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "description": {
                "type": "string"
              },
              "value": {
                "type": "string"
              }
            },
            "required": [
              "key",
              "value"
            ]
          }
        },
        "variables": {
          "default": [],
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "description": {
                "type": "string"
              },
              "value": {
                "type": "string"
              }
            },
            "required": [
              "key",
              "value"
            ]
          }
        },
        "sleepTimeSeconds": {
          "anyOf": [
            {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "number",
              "const": -1
            }
          ]
        },
        "volumes": {
          "description": "HuggingFace Buckets or Repos to mount as volumes in the Space container.",
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "bucket",
                  "model",
                  "dataset",
                  "space"
                ]
              },
              "source": {
                "type": "string",
                "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
              },
              "mountPath": {
                "type": "string",
                "format": "starts_with",
                "pattern": "^\\/.*",
                "description": "Mount path inside the container, e.g. '/data'"
              },
              "revision": {
                "description": "Git revision (only for repos, defaults to 'main')",
                "type": "string"
              },
              "readOnly": {
                "description": "Read-only mount (true for repos, false default for buckets)",
                "type": "boolean"
              },
              "path": {
                "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                "type": "string"
              }
            },
            "required": [
              "type",
              "source",
              "mountPath"
            ]
          }
        },
        "sdk": {
          "type": "string",
          "enum": [
            "gradio",
            "docker",
            "static"
          ],
          "description": "The Space SDK. `static` is free for everyone. `gradio` and `docker` run on compute: on the free `cpu-basic` flavor they require a subscription (PRO for users, Team/Enterprise for orgs), while paid hardware only requires billing (a payment method and prepaid credits)."
        },
        "sdkVersion": {
          "type": [
            "string",
            "null"
          ]
        },
        "devModeEnabled": {
          "type": "boolean"
        }
      },
      "required": [
        "name",
        "type",
        "sdk"
      ]
    }
  ]
}
```

**Responses:**

- **200**: Repository created, url is given
- **409**: Repository already exists, url is given

### POST /api/repos/move

**Move repo**

Move or rename a repo

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "fromRepo": {
      "type": "string",
      "examples": [
        "black-forest-labs/FLUX.1-dev"
      ]
    },
    "toRepo": {
      "type": "string"
    },
    "type": {
      "default": "model",
      "type": "string",
      "enum": [
        "dataset",
        "model",
        "space",
        "bucket",
        "kernel",
        "container"
      ]
    }
  },
  "required": [
    "fromRepo",
    "toRepo"
  ]
}
```

## Users

User accounts are the base authoring entity on the Hub

### GET /api/settings/mcp

**Get MCP tools**

Get the MCP tools for the current user

**Responses:**

- **200**: The MCP tools for the current user

### GET /api/settings/repositories

**List user repositories**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| search | query | string | No | Filter repositories by name (case-insensitive substring match) |
| type | query | string | No | Filter by repository type |
| limit | query | integer | No | Max number of repositories to return |
| sort | query | string | No | Sort field (default: storage) |
| direction | query | string | No | Sort direction (default: desc) |

**Responses:**

- **200**: Repositories with storage usage

### GET /api/settings/billing/usage-v2

**Get user usage**

Get user usage for a given period

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| startDate | query | integer | Yes |  |
| endDate | query | integer | Yes |  |

### GET /api/settings/billing/usage-by-inference-session

**Session inference usage**

Get user inference-provider usage broken down per session id

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| startDate | query | string | No |  |
| endDate | query | string | No |  |

**Responses:**

- **200**: Inference-provider usage breakdown per session, indexed by monthly period

### GET /api/settings/billing/usage/jobs

**Get jobs usage**

Get user Jobs usage for current subscription period

**Responses:**

- **200**: Jobs usage information

### GET /api/settings/billing/usage/live

**Stream usage**

Get live usage for user

### GET /api/settings/metrics/live

**Stream metrics**

Get live usage and running jobs count for the logged-in user, over a single SSE connection

### GET /api/users/{username}/billing/usage/live

**Stream usage**

Get live usage for user

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |

### GET /api/users/{username}/overview

**User overview**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |

**Responses:**

- **200**: User overview data including their organizations, stats, and creation date

### GET /api/users/{username}/socials

**Get social handles**

Get a user's social media handles

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |

**Responses:**

- **200**: The user's social media handles. Only includes handles that the user has provided.

### GET /api/users/{username}/avatar

**Retrieve user avatar**

This endpoint returns a JSON with the avatar URL for the user.

If called with the `Sec-Fetch-Dest: image` header, it instead redirects to the avatar URL

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| redirect | query | string | No | Redirect to the avatar url instead of returning it |

**Responses:**

- **200**: Avatar URL

### GET /api/users/{username}/likes

**List user likes**

List public repos liked by a user

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| limit | query | integer | No | Max number of likes to return |
| cursor | query | string | No | Cursor for pagination. Always check to see if more results, a page can be empty or not filled. |

**Responses:**

- **200**: Likes on public repositories

### GET /api/users/{username}/followers

**List user followers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| cursor | query | string | No | Cursor for pagination |
| limit | query | integer | No | Max number of followers to return |
| expand | query | array | No |  |

**Responses:**

- **200**: The users following the given user

### GET /api/users/{username}/following

**List followed users**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| cursor | query | string | No | Cursor for pagination |

**Responses:**

- **200**: The users followed by the given user

### GET /api/users/{username}/following/orgs

**List followed organizations**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| username | path | string | Yes |  |
| cursor | query | string | No | Cursor for pagination |

**Responses:**

- **200**: The organizations followed by the given user

### GET /api/avatars/{namespace}

**Get avatar**

Display the avatar for any user or organization. This endpoint redirects to the avatar URL for either a user or an organization

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |

## Organizations

The following endpoints let you interact with Hub Organizations and their members.

### GET /api/organizations/{name}/settings/tokens

**Member access tokens**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

List the access tokens of the organization's members. Team or Enterprise only.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| cursor | query | string | No | Pagination cursor from the `Link` header |
| limit | query | integer | No |  |
| q | query | string | No | Filter on `owner:`, `role:`, `status:` and `token:` (last 4 characters), negatable with `-`. Pass `status:all` to include revoked tokens. |

**Responses:**

- **200**: Array of organization member access tokens

### POST /api/organizations/{name}/settings/tokens/{tokenId}/revoke

**Revoke member token**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

An org admin can revoke a token's access to the org. The token itself isn't deleted, it still works outside the org. The token id is the one displayed in the org token settings page or through the tokens listing API endpoint. Enterprise only.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| tokenId | path | string | Yes |  |

### GET /api/organizations/{name}/settings/repositories

**List organization repositories**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| search | query | string | No | Filter repositories by name (case-insensitive substring match) |
| type | query | string | No | Filter by repository type |
| limit | query | integer | No | Max number of repositories to return |
| sort | query | string | No | Sort field (default: storage) |
| direction | query | string | No | Sort direction (default: desc) |

**Responses:**

- **200**: Organization repositories with storage usage

### PUT /api/organizations/{name}/settings/sso/credentials

**Rotate SSO credentials**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Update SSO credentials of the organization's SSO configuration. SSO stays enabled and does not need to be re-tested, so rotation causes no downtime. Requires a paid plan.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "clientSecret": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1024
        }
      },
      "required": [
        "clientSecret"
      ],
      "description": "OIDC client secret"
    },
    {
      "type": "object",
      "properties": {
        "x509Cert": {
          "type": "string",
          "minLength": 1,
          "maxLength": 10000
        }
      },
      "required": [
        "x509Cert"
      ],
      "description": "SAML IdP x509 certificate"
    }
  ]
}
```

**Responses:**

- **200**: The SSO credentials were rotated

### GET /api/organizations/{name}/audit-log/export

**Export audit log**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Export the audit log events in JSON format for a Team or Enterprise organization. The export is limited to the last 100,000 events.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| q | query | string | No |  |

**Responses:**

- **200**: Array of audit log events

### GET /api/organizations/{name}/settings/network-security

**Network security settings**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Get the network security settings for an organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: Network security settings

### PATCH /api/organizations/{name}/settings/network-security

**Update network security**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Update the network security settings for an organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "enforceAuth": {
      "type": "boolean"
    },
    "enforceIpRestriction": {
      "type": "boolean"
    },
    "highRateLimits": {
      "type": "boolean"
    },
    "ipRanges": {
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "string",
            "format": "cidrv4",
            "pattern": "^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\\/([0-9]|[1-2][0-9]|3[0-2])$"
          },
          {
            "type": "string",
            "format": "cidrv6",
            "pattern": "^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$"
          }
        ]
      }
    },
    "blockedContents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resource": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "dataset",
                  "model",
                  "space",
                  "bucket",
                  "kernel",
                  "container"
                ]
              },
              {
                "type": "string",
                "const": "*"
              }
            ]
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "resource",
          "scope"
        ]
      }
    },
    "allowedContents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resource": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "dataset",
                  "model",
                  "space",
                  "bucket",
                  "kernel",
                  "container"
                ]
              },
              {
                "type": "string",
                "const": "*"
              }
            ]
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "resource",
          "scope"
        ]
      }
    },
    "keepReposMetadataVisible": {
      "type": "boolean"
    }
  }
}
```

**Responses:**

- **200**: Updated network security settings

### GET /api/organizations/{name}/avatar

**Get avatar**

Retrieve organization avatar. This endpoint returns a JSON with the avatar URL for the organization.

If called with the `Sec-Fetch-Dest: image` header, it instead redirects to the avatar URL

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| redirect | query | string | No | Redirect to the avatar url instead of returning it |

**Responses:**

- **200**: Avatar URL

### GET /api/organizations/{name}/members

**Get organization members**

Get a list of members for the organization with optional search and pagination.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| search | query | string | No |  |
| email | query | string | No |  |
| cursor | query | string | No |  |
| limit | query | integer | No |  |
| includeExternal | query | string | No | Include external collaborators. Only honored for org admins. |

**Responses:**

- **200**: Array of organization members

### PUT /api/organizations/{name}/members/{username}/role

**Change member role**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Change the role of a member in the organization. Need a paid plan.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| username | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "admin",
        "write",
        "contributor",
        "read",
        "no_access"
      ]
    },
    "resourceGroups": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24,
            "pattern": "^[0-9a-fA-F]{24}$"
          },
          "role": {
            "type": "string",
            "enum": [
              "admin",
              "write",
              "contributor",
              "read",
              "no_access",
              "inherit"
            ]
          }
        },
        "required": [
          "id",
          "role"
        ]
      }
    }
  },
  "required": [
    "role"
  ]
}
```

### PUT /api/organizations/{name}/members/{username}/account-type

**Change account type**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Convert a member into an external collaborator, who isn't required to sign in with SSO, or back into a member. Need a paid plan. Doesn't affect the role, which must be changed separately.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| username | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "accountType": {
      "type": "string",
      "enum": [
        "member",
        "external"
      ]
    }
  },
  "required": [
    "accountType"
  ]
}
```

### GET /api/organizations/{name}/billing/usage-v2

**Get org usage**

Get org usage for a given period

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startDate | query | integer | Yes |  |
| endDate | query | integer | Yes |  |

### GET /api/organizations/{name}/billing/usage-by-resource-group

**Resource group usage**

Get org usage breakdown per resource group, returned as a time-series of monthly periods. Window is [startDate, endDate], defaults to the current month. Both dates must fall within the last 12 months. Storage values are the peak observed within each monthly period.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startDate | query | string | No |  |
| endDate | query | string | No |  |

**Responses:**

- **200**: Org usage breakdown per resource group, indexed by monthly period

### GET /api/organizations/{name}/billing/usage-by-inference-session

**Session inference usage**

Get org inference-provider usage broken down per session id, as a time-series of monthly periods.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startDate | query | string | No |  |
| endDate | query | string | No |  |

**Responses:**

- **200**: Inference-provider usage breakdown per session, indexed by monthly period

### GET /api/organizations/{name}/billing/usage/inference

**Inference usage**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Get org inference-provider usage per member, model and provider, returned as a time-series of daily periods. Window is [startDate, endDate], defaults to the current month. Both dates must fall within the last 12 months. Returns up to `limit` periods, follow the `Link` header for the next ones. Requests are included up to 2 hours after they are made.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startDate | query | string | No |  |
| endDate | query | string | No |  |
| limit | query | integer | No | Number of daily periods per page |

**Responses:**

- **200**: Org inference-provider usage per member, model and provider, indexed by daily period

### GET /api/organizations/{name}/billing/usage/live

**Stream usage**

Get live usage for org

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

### GET /api/organizations/{name}/socials

**Get social handles**

Get an organization's social media handles

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: The organization's social media handles. Only includes handles that the organization has provided.

### GET /api/avatars/{namespace}

**Get avatar**

Display the avatar for any user or organization. This endpoint redirects to the avatar URL for either a user or an organization

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |

## Service Accounts

The following endpoints manage service accounts and their tokens.

### GET /api/organizations/{name}/service-accounts

**List service accounts**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

List all service accounts for the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: List of service accounts

### POST /api/organizations/{name}/service-accounts

**Create service account**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Create a new service account for the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "description": "Display name for the service account"
    },
    "description": {
      "description": "Optional description of what this service account is used for",
      "type": "string",
      "maxLength": 500
    }
  },
  "required": [
    "name"
  ]
}
```

**Responses:**

- **201**: Created service account

### GET /api/organizations/{name}/service-accounts/{serviceAccountId}

**Get service account**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Retrieve a single service account and its access token metadata. Token secrets are never returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |

**Responses:**

- **200**: Service account

### DELETE /api/organizations/{name}/service-accounts/{serviceAccountId}

**Delete service account**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Delete a service account and all its tokens. This action cannot be undone.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |

**Responses:**

- **204**: Service account deleted

### POST /api/organizations/{name}/service-accounts/{serviceAccountId}/tokens

**Create service-account token**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Create a new access token for a service account. Store the token securely - it cannot be retrieved later.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "displayName": {
      "default": "API Token",
      "description": "Display name for the token",
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "permissions": {
      "default": [],
      "description": "Org-wide permissions for this token",
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo.content.read",
          "repo.contribute.write",
          "repo.write",
          "inference.serverless.write",
          "inference.endpoints.infer.write",
          "inference.endpoints.write",
          "org.read",
          "org.write",
          "collection.read",
          "collection.write",
          "resourceGroup.write",
          "job.write",
          "org.serviceAccounts.read",
          "org.serviceAccounts.write",
          "org.auditLog.write"
        ]
      }
    },
    "repoIds": {
      "description": "Repositories to grant `repoPermissions` on. Can be repositories owned by the organization or any public repository. These override the org-wide permissions.",
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 24,
        "maxLength": 24,
        "pattern": "^[0-9a-fA-F]{24}$"
      }
    },
    "repoPermissions": {
      "default": [],
      "description": "Permissions granted on the selected `repoIds`.",
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo.content.read",
          "repo.write"
        ]
      }
    },
    "endpointPatterns": {
      "default": [],
      "description": "Inference endpoint name patterns (wildcards allowed, e.g. `gpt2-*`) restricting the token's org-wide Inference Endpoint permissions to matching endpoints. Empty means all endpoints.",
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "string",
        "maxLength": 256,
        "pattern": "^[^.?()\\]\\\\[{}]+$"
      }
    },
    "skipNetworkSecurity": {
      "default": false,
      "description": "Exempt this token from the org's Network Security enforcement (IP allowlist and content access policy). Enterprise Plus only, and requires the `org.networkSecurity.write` permission.",
      "type": "boolean"
    }
  }
}
```

**Responses:**

- **201**: Created token

### DELETE /api/organizations/{name}/service-accounts/{serviceAccountId}/tokens/{tokenId}

**Delete service-account token**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Delete an access token from a service account. This action cannot be undone.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |
| tokenId | path | string | Yes |  |

**Responses:**

- **204**: Token deleted

### PATCH /api/organizations/{name}/service-accounts/{serviceAccountId}/tokens/{tokenId}

**Update service-account token**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Update the name and/or permissions of an existing service account token.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |
| tokenId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "displayName": {
      "description": "New display name for the token",
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo.content.read",
          "repo.contribute.write",
          "repo.write",
          "inference.serverless.write",
          "inference.endpoints.infer.write",
          "inference.endpoints.write",
          "org.read",
          "org.write",
          "collection.read",
          "collection.write",
          "resourceGroup.write",
          "job.write",
          "org.serviceAccounts.read",
          "org.serviceAccounts.write",
          "org.auditLog.write"
        ]
      },
      "description": "Org-wide permissions for this token"
    },
    "repoIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 24,
        "maxLength": 24,
        "pattern": "^[0-9a-fA-F]{24}$"
      },
      "description": "Repositories to grant `repoPermissions` on. Can be repositories owned by the organization or any public repository. These override the org-wide permissions."
    },
    "repoPermissions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo.content.read",
          "repo.write"
        ]
      },
      "description": "Permissions granted on the selected `repoIds`."
    },
    "endpointPatterns": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "string",
        "maxLength": 256,
        "pattern": "^[^.?()\\]\\\\[{}]+$"
      },
      "description": "Inference endpoint name patterns (wildcards allowed, e.g. `gpt2-*`) restricting the token's org-wide Inference Endpoint permissions to matching endpoints. Empty means all endpoints."
    },
    "skipNetworkSecurity": {
      "type": "boolean",
      "description": "Exempt this token from the org's Network Security enforcement (IP allowlist and content access policy). Enterprise Plus only, and requires the `org.networkSecurity.write` permission."
    }
  }
}
```

**Responses:**

- **200**: Updated token info

### POST /api/organizations/{name}/service-accounts/{serviceAccountId}/tokens/{tokenId}/rotate

**Rotate service-account token**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Invalidate an existing token and generate a new one with the same permissions. The old token will stop working immediately.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| serviceAccountId | path | string | Yes |  |
| tokenId | path | string | Yes |  |

**Responses:**

- **200**: Rotated token

## Jobs

The following endpoints manage jobs.

### POST /api/jobs/{namespace}/auth-check/{perms}

**Check access**

Check if the user has access to jobs in the namespace

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| perms | path | string | Yes |  |

**Responses:**

- **200**: The user has access to jobs in the namespace

### POST /api/jobs/{namespace}/{jobId}/auth-check/{perms}

**Check access**

Check if the user has access to jobs in the namespace

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |
| perms | path | string | Yes |  |

**Responses:**

- **200**: The user has access to jobs in the namespace

### GET /api/jobs/hardware

**Get job hardware**

Get available job hardware

**Responses:**

- **200**: Available job hardware (public only)

### GET /api/jobs/{namespace}

**List jobs**

List of jobs for an entity

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| label | query | string | No | Filter jobs by label. Format: 'key=value' (e.g., 'environment=production'). Repeat the parameter to filter by several labels. |
| stage | query | string | No | Filter jobs by status stage. Repeat the parameter to filter by several stages. |
| cursor | query | string | No | Pagination cursor obtained from the `rel="next"` link of a previous response's `Link` header. |

**Responses:**

- **200**: The list of jobs

### POST /api/jobs/{namespace}

**Start a job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "spaceId": {
          "allOf": [
            {
              "type": "string"
            },
            {
              "type": "string",
              "minLength": 1
            }
          ]
        },
        "dockerImage": {
          "type": "string"
        },
        "arguments": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "command": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "environment": {
          "default": {},
          "type": "object",
          "propertyNames": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
          },
          "additionalProperties": {
            "type": "string"
          }
        },
        "secrets": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
          },
          "additionalProperties": {
            "type": "string"
          }
        },
        "flavor": {
          "type": "string",
          "enum": [
            "cpu-basic",
            "cpu-upgrade",
            "cpu-performance",
            "cpu-xl",
            "sprx8",
            "zero-a10g",
            "t4-small",
            "t4-medium",
            "l4x1",
            "l4x4",
            "l40sx1",
            "l40sx4",
            "l40sx8",
            "a10g-small",
            "a10g-large",
            "a10g-largex2",
            "a10g-largex4",
            "a100-large",
            "a100x4",
            "a100x8",
            "h200",
            "h200x2",
            "h200x4",
            "h200x8",
            "rtx-pro-6000",
            "rtx-pro-6000x2",
            "rtx-pro-6000x4",
            "rtx-pro-6000x8",
            "inf2x6"
          ]
        },
        "arch": {
          "type": "string",
          "enum": [
            "amd64",
            "arm64"
          ]
        },
        "timeoutSeconds": {
          "default": null,
          "anyOf": [
            {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "attempts": {
          "default": 1,
          "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        },
        "labels": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "maxLength": 100,
            "pattern": "^[a-zA-Z0-9_-]+$"
          },
          "additionalProperties": {
            "type": "string",
            "maxLength": 100,
            "pattern": "^[a-zA-Z0-9_-]*$"
          },
          "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
        },
        "volumes": {
          "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "bucket",
                  "model",
                  "dataset",
                  "space"
                ]
              },
              "source": {
                "type": "string",
                "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
              },
              "mountPath": {
                "type": "string",
                "format": "starts_with",
                "pattern": "^\\/.*",
                "description": "Mount path inside the container, e.g. '/data'"
              },
              "revision": {
                "description": "Git revision (only for repos, defaults to 'main')",
                "type": "string"
              },
              "readOnly": {
                "description": "Read-only mount (true for repos, false default for buckets)",
                "type": "boolean"
              },
              "path": {
                "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                "type": "string"
              }
            },
            "required": [
              "type",
              "source",
              "mountPath"
            ]
          }
        },
        "expose": {
          "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
          "type": "object",
          "properties": {
            "ports": {
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              }
            },
            "portsPublic": {
              "description": "Subset of `ports` reachable without any authentication.",
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              }
            }
          },
          "required": [
            "ports"
          ]
        },
        "ssh": {
          "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
          "type": "object",
          "properties": {
            "enabled": {
              "default": false,
              "type": "boolean"
            }
          }
        },
        "network": {
          "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
          "type": "object",
          "properties": {
            "group": {
              "type": "string",
              "maxLength": 46,
              "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
              "description": "Group name, scoped to the job's owner and resource group."
            },
            "aliases": {
              "default": [],
              "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 34,
                "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
              }
            }
          },
          "required": [
            "group"
          ]
        },
        "resourceGroupId": {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "flavor",
        "spaceId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "spaceId": {
          "type": "string"
        },
        "dockerImage": {
          "allOf": [
            {
              "type": "string"
            },
            {
              "type": "string",
              "minLength": 1
            }
          ]
        },
        "arguments": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "command": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "environment": {
          "default": {},
          "type": "object",
          "propertyNames": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
          },
          "additionalProperties": {
            "type": "string"
          }
        },
        "secrets": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
          },
          "additionalProperties": {
            "type": "string"
          }
        },
        "flavor": {
          "type": "string",
          "enum": [
            "cpu-basic",
            "cpu-upgrade",
            "cpu-performance",
            "cpu-xl",
            "sprx8",
            "zero-a10g",
            "t4-small",
            "t4-medium",
            "l4x1",
            "l4x4",
            "l40sx1",
            "l40sx4",
            "l40sx8",
            "a10g-small",
            "a10g-large",
            "a10g-largex2",
            "a10g-largex4",
            "a100-large",
            "a100x4",
            "a100x8",
            "h200",
            "h200x2",
            "h200x4",
            "h200x8",
            "rtx-pro-6000",
            "rtx-pro-6000x2",
            "rtx-pro-6000x4",
            "rtx-pro-6000x8",
            "inf2x6"
          ]
        },
        "arch": {
          "type": "string",
          "enum": [
            "amd64",
            "arm64"
          ]
        },
        "timeoutSeconds": {
          "default": null,
          "anyOf": [
            {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "attempts": {
          "default": 1,
          "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        },
        "labels": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "maxLength": 100,
            "pattern": "^[a-zA-Z0-9_-]+$"
          },
          "additionalProperties": {
            "type": "string",
            "maxLength": 100,
            "pattern": "^[a-zA-Z0-9_-]*$"
          },
          "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
        },
        "volumes": {
          "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "bucket",
                  "model",
                  "dataset",
                  "space"
                ]
              },
              "source": {
                "type": "string",
                "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
              },
              "mountPath": {
                "type": "string",
                "format": "starts_with",
                "pattern": "^\\/.*",
                "description": "Mount path inside the container, e.g. '/data'"
              },
              "revision": {
                "description": "Git revision (only for repos, defaults to 'main')",
                "type": "string"
              },
              "readOnly": {
                "description": "Read-only mount (true for repos, false default for buckets)",
                "type": "boolean"
              },
              "path": {
                "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                "type": "string"
              }
            },
            "required": [
              "type",
              "source",
              "mountPath"
            ]
          }
        },
        "expose": {
          "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
          "type": "object",
          "properties": {
            "ports": {
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              }
            },
            "portsPublic": {
              "description": "Subset of `ports` reachable without any authentication.",
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              }
            }
          },
          "required": [
            "ports"
          ]
        },
        "ssh": {
          "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
          "type": "object",
          "properties": {
            "enabled": {
              "default": false,
              "type": "boolean"
            }
          }
        },
        "network": {
          "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
          "type": "object",
          "properties": {
            "group": {
              "type": "string",
              "maxLength": 46,
              "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
              "description": "Group name, scoped to the job's owner and resource group."
            },
            "aliases": {
              "default": [],
              "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 34,
                "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
              }
            }
          },
          "required": [
            "group"
          ]
        },
        "resourceGroupId": {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        }
      },
      "required": [
        "flavor",
        "dockerImage"
      ]
    }
  ]
}
```

**Responses:**

- **200**: The job after it has been started

### GET /api/jobs/{namespace}/count

**Count jobs**

Count the number of jobs for an entity with optional status stage filter

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| stage | query | string | No |  |

**Responses:**

- **200**: The count of jobs matching the filter

### GET /api/jobs/{namespace}/{jobId}

**Get a job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Responses:**

- **200**: The job

### GET /api/jobs/{namespace}/{jobId}/logs

**Stream job logs**

Stream the logs of a job, using SSE

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |
| tail | query | integer | No | Maximum number of lines to return from the logs. |

### GET /api/jobs/{namespace}/{jobId}/metrics

**Stream job metrics**

Stream the metrics of a job, using SSE

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

### GET /api/jobs/{namespace}/{jobId}/events

**Stream job events**

Stream the events of a job, using SSE

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

### POST /api/jobs/{namespace}/{jobId}/cancel

**Cancel a job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Responses:**

- **200**: The job after it has been canceled

### POST /api/jobs/{namespace}/{jobId}/duplicate

**Duplicate a job**

Duplicate an existing job, re-using its spec

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Responses:**

- **200**: The new job after it has been duplicated

### PUT /api/jobs/{namespace}/{jobId}/labels

**Update job labels**

Replace user-provided labels on a job

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "labels": {
      "type": "object",
      "propertyNames": {
        "type": "string",
        "maxLength": 100,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "additionalProperties": {
        "type": "string",
        "maxLength": 100,
        "pattern": "^[a-zA-Z0-9_-]*$"
      },
      "description": "The new labels to set on the job. Replaces all existing labels."
    }
  },
  "required": [
    "labels"
  ]
}
```

**Responses:**

- **200**: The job after labels have been updated

### PUT /api/jobs/{namespace}/{jobId}/expose

**Job exposed ports**

Replace the exposed ports of a running job, applied live (no re-run). Ports listed in `portsPublic` are reachable without any authentication.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ports": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
      }
    },
    "portsPublic": {
      "description": "Subset of `ports` reachable without any authentication.",
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
      }
    }
  },
  "required": [
    "ports"
  ]
}
```

**Responses:**

- **200**: The job after its exposed ports have been updated

### POST /api/scheduled-jobs/{namespace}

**Create scheduled job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "jobSpec": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "dockerImage": {
              "type": "string"
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "spaceId"
          ]
        },
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "type": "string"
            },
            "dockerImage": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "dockerImage"
          ]
        }
      ]
    },
    "schedule": {
      "type": "string",
      "pattern": "^(?:(@(annually|yearly|monthly|weekly|daily|hourly))|((((\\d+,)+\\d+|((\\*|\\d+)(\\/|-)\\d+)|\\d+|\\*) ?){5,7}))$",
      "description": "CRON schedule expression (e.g., '0 9 * * 1' for 9 AM every Monday)."
    },
    "suspend": {
      "default": false,
      "description": "Whether the scheduled job is suspended (paused)",
      "type": "boolean"
    },
    "concurrency": {
      "default": false,
      "description": "Whether multiple instances of this job can run concurrently",
      "type": "boolean"
    }
  },
  "required": [
    "jobSpec",
    "schedule"
  ]
}
```

**Responses:**

- **200**: The scheduled job data

### GET /api/scheduled-jobs/{namespace}

**List scheduled jobs**

List scheduled jobs for an entity

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| label | query | string | No | Filter scheduled jobs by label. Format: 'key=value' (e.g., 'environment=production'). |

**Responses:**

- **200**: Array of scheduled job data

### GET /api/scheduled-jobs/{namespace}/{jobId}

**Get scheduled job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Responses:**

- **200**: The scheduled job data

### DELETE /api/scheduled-jobs/{namespace}/{jobId}

**Delete scheduled job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

### POST /api/scheduled-jobs/{namespace}/{jobId}/suspend

**Suspend scheduled job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

### POST /api/scheduled-jobs/{namespace}/{jobId}/resume

**Resume scheduled job**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

### POST /api/scheduled-jobs/{namespace}/{jobId}/run

**Run job**

Trigger a scheduled job run. Trigger a scheduled job to run immediately. Throws an error if an instance is already running and job spec does not allow concurrent runs.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Responses:**

- **200**: The job that was triggered
- **409**: Another instance is already running, job was not triggered

### POST /api/scheduled-jobs/{namespace}/{jobId}/schedule

**Update job schedule**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schedule": {
      "type": "string",
      "pattern": "^(?:(@(annually|yearly|monthly|weekly|daily|hourly))|((((\\d+,)+\\d+|((\\*|\\d+)(\\/|-)\\d+)|\\d+|\\*) ?){5,7}))$",
      "description": "CRON schedule expression (e.g., '0 9 * * 1' for 9 AM every Monday)."
    }
  },
  "required": [
    "schedule"
  ]
}
```

**Responses:**

- **200**: The updated scheduled job

### PUT /api/scheduled-jobs/{namespace}/{jobId}/labels

**Scheduled job labels**

Replace user-provided labels on a scheduled job

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| jobId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "labels": {
      "type": "object",
      "propertyNames": {
        "type": "string",
        "maxLength": 100,
        "pattern": "^[a-zA-Z0-9_-]+$"
      },
      "additionalProperties": {
        "type": "string",
        "maxLength": 100,
        "pattern": "^[a-zA-Z0-9_-]*$"
      },
      "description": "The new labels to set on the job. Replaces all existing labels."
    }
  },
  "required": [
    "labels"
  ]
}
```

**Responses:**

- **200**: The scheduled job after labels have been updated

## Resource groups

The following endpoints manage resource groups. Resource groups are a Team or Enterprise feature.

### PATCH /api/organizations/{name}/resource-groups/{resourceGroupId}

**Update resource group**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Update the name, description and/or monthly spend limits (in cents, `null` to remove) of a resource group.

`spendLimits.total` caps the group's combined spend across every product; the per-product limits cap each product on top of it.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "maxLength": 500
    },
    "spendLimits": {
      "type": "object",
      "properties": {
        "total": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "inferenceProviders": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "spaces": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "jobs": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        },
        "endpoints": {
          "anyOf": [
            {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            {
              "type": "null"
            }
          ]
        }
      }
    }
  }
}
```

**Responses:**

- **200**: The updated resource group

### DELETE /api/organizations/{name}/resource-groups/{resourceGroupId}

**Delete resource group**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Delete a resource group from the organization.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Responses:**

- **200**: Whether the resource group was deleted

### GET /api/organizations/{name}/resource-groups/{resourceGroupId}

**Get resource group**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Retrieve a single resource group by id.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Responses:**

- **200**: The resource group

### POST /api/organizations/{name}/resource-groups/{resourceGroupId}/settings

**Configure auto-join**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Configure the auto-join settings of a resource group.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "autoJoin": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "enabled": {
              "anyOf": [
                {
                  "type": "boolean",
                  "const": true
                },
                {
                  "type": "string",
                  "const": "true"
                }
              ]
            },
            "role": {
              "type": "string",
              "enum": [
                "admin",
                "write",
                "contributor",
                "read",
                "no_access",
                "inherit"
              ]
            },
            "scope": {
              "type": "string",
              "enum": [
                "all",
                "read_plus"
              ]
            }
          },
          "required": [
            "enabled",
            "role"
          ]
        },
        {
          "type": "object",
          "properties": {
            "enabled": {
              "anyOf": [
                {
                  "type": "boolean",
                  "const": false
                },
                {
                  "type": "string",
                  "const": "false"
                }
              ]
            }
          },
          "required": [
            "enabled"
          ]
        }
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated resource group

### POST /api/organizations/{name}/resource-groups/{resourceGroupId}/users

**Add users**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Add one or more organization members to a resource group.

Use the `inherit` role to give a member the same role they have in the organization, following it when it changes.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "users": {
      "minItems": 1,
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "role": {
                "type": "string",
                "enum": [
                  "admin",
                  "write",
                  "contributor",
                  "read",
                  "no_access",
                  "inherit"
                ]
              }
            },
            "required": [
              "name",
              "role"
            ]
          },
          {
            "type": "object",
            "properties": {
              "user": {
                "type": "string"
              },
              "role": {
                "type": "string",
                "enum": [
                  "admin",
                  "write",
                  "contributor",
                  "read",
                  "no_access",
                  "inherit"
                ]
              }
            },
            "required": [
              "user",
              "role"
            ]
          }
        ]
      }
    }
  },
  "required": [
    "users"
  ]
}
```

**Responses:**

- **200**: The updated resource group

### POST /api/organizations/{name}/resource-groups/{resourceGroupId}/invite

**Invite external user**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Invite a user who is not yet an organization member into a resource group. On accepting, they only get access to that resource group, with the requested read or write role.

Requires external invites to be enabled in the organization's resource group settings, unless the caller is an organization admin.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "username": {
      "type": "string",
      "minLength": 2,
      "maxLength": 42,
      "pattern": "^\\b(?!\\d+$)(?![0-9a-fA-F]{24}$)([a-zA-Z0-9]|-(?!-))+\\b$",
      "description": "Username of an existing Hugging Face user"
    },
    "role": {
      "type": "string",
      "enum": [
        "read",
        "write"
      ],
      "description": "Role the invitee gets inside the resource group"
    }
  },
  "required": [
    "username",
    "role"
  ]
}
```

**Responses:**

- **200**: The created invitation

### GET /api/organizations/{name}/resource-groups/{resourceGroupId}/invitations

**List pending invitations**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |

**Responses:**

- **200**: Invitations pending on the resource group

### DELETE /api/organizations/{name}/resource-groups/{resourceGroupId}/invitation/{id}

**Revoke invitation**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |
| id | path | string | Yes |  |

### POST /api/organizations/{name}/resource-groups/{resourceGroupId}/invitation/{id}/resend

**Resend invitation**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |
| id | path | string | Yes |  |

**Responses:**

- **200**: The invitation, with its pushed-out expiry

### DELETE /api/organizations/{name}/resource-groups/{resourceGroupId}/users/{username}

**Remove user**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Remove a user from a resource group, revoking the access granted through it.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |
| username | path | string | Yes |  |

**Responses:**

- **200**: The updated resource group

### PATCH /api/organizations/{name}/resource-groups/{resourceGroupId}/users/{username}

**Change user role**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Change the role of a user in a resource group. In a SCIM-managed resource group, pass `resetToScimRole` to undo a manual role change and restore the role mapped from the user's SCIM groups.

Use the `inherit` role to give the member the same role they have in the organization, following it when it changes.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| resourceGroupId | path | string | Yes |  |
| username | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "role": {
          "type": "string",
          "enum": [
            "admin",
            "write",
            "contributor",
            "read",
            "no_access",
            "inherit"
          ]
        }
      },
      "required": [
        "role"
      ]
    },
    {
      "type": "object",
      "properties": {
        "resetToScimRole": {
          "type": "boolean",
          "const": true
        }
      },
      "required": [
        "resetToScimRole"
      ],
      "description": "Reset the role to the one mapped from SCIM groups"
    }
  ]
}
```

**Responses:**

- **200**: The updated resource group

### GET /api/organizations/{name}/resource-groups

**Get resource groups**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Retrieve accessible resource groups. Get all resource groups the user has access to.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: Resource groups the user has access to

### POST /api/organizations/{name}/resource-groups

**Create resource group**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Create a new resource group in the organization.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "maxLength": 500
    },
    "users": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "user": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "admin",
              "write",
              "contributor",
              "read",
              "no_access",
              "inherit"
            ]
          }
        },
        "required": [
          "user",
          "role"
        ]
      }
    },
    "repos": {
      "default": [],
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/RepoId"
      }
    },
    "autoJoin": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "enabled": {
              "type": "boolean",
              "const": true
            },
            "role": {
              "type": "string",
              "enum": [
                "admin",
                "write",
                "contributor",
                "read",
                "no_access",
                "inherit"
              ]
            },
            "scope": {
              "type": "string",
              "enum": [
                "all",
                "read_plus"
              ]
            }
          },
          "required": [
            "enabled",
            "role"
          ]
        },
        {
          "type": "object",
          "properties": {
            "enabled": {
              "type": "boolean",
              "const": false
            }
          },
          "required": [
            "enabled"
          ]
        }
      ]
    }
  },
  "required": [
    "name"
  ]
}
```

**Responses:**

- **200**: The created resource group

### GET /api/organizations/{name}/resource-groups/settings

**Get resource group settings**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Retrieve the org-wide resource group settings: who may create resource groups, and whether resource group admins may invite users from outside the org.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: The organization's resource group settings

### POST /api/organizations/{name}/resource-groups/settings

**Update resource group settings**

**Requires plan:** Team, Enterprise, Enterprise Plus, Academia Hub

Update the org-wide resource group settings. Omitted fields are left unchanged.

Enabling `allowExternalInvites` lets resource group admins add members to the org, consuming billable seats.

Requires the org to have a Team plan or higher.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "minRoleToCreate": {
      "description": "Minimum organization role required to create a resource group",
      "type": "string",
      "enum": [
        "admin",
        "write",
        "contributor",
        "read"
      ]
    },
    "allowExternalInvites": {
      "description": "Whether resource group admins may invite users from outside the organization",
      "type": [
        "string",
        "boolean"
      ]
    }
  }
}
```

**Responses:**

- **200**: The organization's resource group settings

## Paper pages

The following endpoint gets information about papers.

### POST /api/settings/papers/claim

**Claim paper authorship**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paperId": {
      "description": "ArXiv paper identifier being claimed.",
      "type": "string",
      "pattern": "^\\d{4}\\.\\d{4,5}$"
    },
    "claimAuthorId": {
      "description": "Author entry on the paper being claimed.",
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "targetUserId": {
      "description": "HF user who should receive the claim.",
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    }
  },
  "required": [
    "paperId",
    "claimAuthorId"
  ]
}
```

**Responses:**

- **200**: Paper authorship claim result, including the claimed paper id

### GET /api/daily_papers

**Get Daily Papers**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| p | query | integer | No |  |
| limit | query | integer | No |  |
| date | query | string | No |  |
| week | query | string | No |  |
| month | query | string | No |  |
| submitter | query | string | No |  |
| sort | query | string | No |  |

**Responses:**

- **200**: List of daily papers

### GET /api/papers

**List papers**

List arXiv papers sorted by published date

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| cursor | query | string | No | Pagination cursor |
| limit | query | integer | No |  |

**Responses:**

- **200**: List of papers

### GET /api/papers/search

**Search papers**

Perform a hybrid semantic / full-text-search on papers

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | No |  |
| limit | query | integer | No |  |

### POST /api/papers/index

**Index a paper**

Index a paper from arXiv by its ID. If the paper is already indexed, only its authors can re-index it.

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "arxivId": {
      "description": "The arXiv ID of the paper to index (e.g. 2301.00001)",
      "type": "string",
      "pattern": "^\\d{4}\\.\\d{4,5}$"
    }
  },
  "required": [
    "arxivId"
  ]
}
```

**Responses:**

- **200**: Empty object on success

### GET /api/papers/{paperId}

**Get a paper**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |
| field | query | string | No |  |

**Responses:**

- **200**: Paper data

### POST /api/papers/{paperId}/links

**Update paper links**

Update the project page, GitHub repository, or submitting organization for a paper. Requires the requester to be the paper author, the Daily Papers submitter, or a papers admin.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "projectPage": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "githubRepo": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "organizationId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ]
    }
  }
}
```

**Responses:**

- **200**: Paper links updated

### POST /api/papers/{paperId}/media

**Update paper media**

Replace the media shown on a Daily Papers submission. Requires the requester to be the paper author, the Daily Papers submitter, or a papers admin.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| paperId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "mediaUrls": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "(^https:\\/\\/s3\\.amazonaws\\.com\\/hf-hub-cdn-uploads\\/.*\\.(gif|jpeg|jpg|mov|mp3|mp4|mpga|png|qt|wav|webm|webp)$)|(^https:\\/\\/cdn-uploads\\.huggingface\\.co\\/.*\\.(gif|jpeg|jpg|mov|mp3|mp4|mpga|png|qt|wav|webm|webp)$)"
      },
      "description": "Media URLs, in display order"
    }
  },
  "required": [
    "mediaUrls"
  ]
}
```

**Responses:**

- **200**: Paper media updated

## Collections

Use Collections to group repositories from the Hub (Models, Datasets, Spaces and Papers) on a dedicated page.

You can learn more about it in the Collections [guide](https://huggingface.co/docs/hub/collections). Collections can also be managed using the Python client (see [guide](https://huggingface.co/docs/huggingface_hub/main/en/guides/collections)).

### GET /api/collections/{namespace}/{slug}-{id}

**Get a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Responses:**

- **200**: The collection data

### PATCH /api/collections/{namespace}/{slug}-{id}

**Update a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "position": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "private": {
      "type": "boolean"
    },
    "theme": {
      "type": "string",
      "enum": [
        "orange",
        "blue",
        "green",
        "purple",
        "pink",
        "indigo"
      ]
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "description": {
      "type": "string",
      "maxLength": 150
    },
    "gating": {
      "anyOf": [
        {
          "type": "boolean",
          "const": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "auto"
            },
            "profileSharing": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": true
                    },
                    "email": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": false
                    },
                    "email": {
                      "type": "boolean",
                      "const": false
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                }
              ],
              "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
            }
          },
          "required": [
            "mode"
          ]
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "manual"
            },
            "notifications": {
              "type": "object",
              "properties": {
                "mode": {
                  "type": "string",
                  "enum": [
                    "bulk",
                    "real-time"
                  ]
                },
                "email": {
                  "type": "string"
                }
              },
              "required": [
                "mode"
              ]
            },
            "profileSharing": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": true
                    },
                    "email": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": false
                    },
                    "email": {
                      "type": "boolean",
                      "const": false
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                }
              ],
              "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
            }
          },
          "required": [
            "mode",
            "notifications"
          ]
        }
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated collection

### DELETE /api/collections/{namespace}/{slug}-{id}

**Delete a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

### GET /api/collections/{namespace}/{slug}

**Get a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Responses:**

- **200**: The collection data

### PATCH /api/collections/{namespace}/{slug}

**Update a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "position": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "private": {
      "type": "boolean"
    },
    "theme": {
      "type": "string",
      "enum": [
        "orange",
        "blue",
        "green",
        "purple",
        "pink",
        "indigo"
      ]
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "description": {
      "type": "string",
      "maxLength": 150
    },
    "gating": {
      "anyOf": [
        {
          "type": "boolean",
          "const": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "auto"
            },
            "profileSharing": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": true
                    },
                    "email": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": false
                    },
                    "email": {
                      "type": "boolean",
                      "const": false
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                }
              ],
              "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
            }
          },
          "required": [
            "mode"
          ]
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "manual"
            },
            "notifications": {
              "type": "object",
              "properties": {
                "mode": {
                  "type": "string",
                  "enum": [
                    "bulk",
                    "real-time"
                  ]
                },
                "email": {
                  "type": "string"
                }
              },
              "required": [
                "mode"
              ]
            },
            "profileSharing": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": true
                    },
                    "email": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "username": {
                      "type": "boolean",
                      "const": false
                    },
                    "email": {
                      "type": "boolean",
                      "const": false
                    }
                  },
                  "required": [
                    "username",
                    "email"
                  ]
                }
              ],
              "description": "What Hugging Face shares with the repo authors when a user requests access. Defaults to the username and email."
            }
          },
          "required": [
            "mode",
            "notifications"
          ]
        }
      ]
    }
  }
}
```

**Responses:**

- **200**: The updated collection

### DELETE /api/collections/{namespace}/{slug}

**Delete a collection**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

### POST /api/collections/{namespace}/{slug}-{id}/items

**Add item**

Add an item to a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "item": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "paper",
            "collection",
            "space",
            "model",
            "dataset",
            "bucket"
          ]
        },
        "id": {
          "type": "string"
        }
      },
      "required": [
        "type",
        "id"
      ]
    },
    "note": {
      "type": "string",
      "maxLength": 500
    }
  },
  "required": [
    "item"
  ]
}
```

**Responses:**

- **200**: The updated collection

### POST /api/collections/{namespace}/{slug}/items

**Add item**

Add an item to a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "item": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "paper",
            "collection",
            "space",
            "model",
            "dataset",
            "bucket"
          ]
        },
        "id": {
          "type": "string"
        }
      },
      "required": [
        "type",
        "id"
      ]
    },
    "note": {
      "type": "string",
      "maxLength": 500
    }
  },
  "required": [
    "item"
  ]
}
```

**Responses:**

- **200**: The updated collection

### POST /api/collections/{namespace}/{slug}-{id}/items/batch

**Batch update items**

Batch update items in a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "update"
        ]
      },
      "_id": {
        "type": "string",
        "minLength": 24,
        "maxLength": 24,
        "pattern": "^[0-9a-fA-F]{24}$"
      },
      "data": {
        "type": "object",
        "properties": {
          "gallery": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uri"
            }
          },
          "note": {
            "type": "string",
            "maxLength": 500
          },
          "position": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          }
        }
      }
    },
    "required": [
      "action",
      "_id",
      "data"
    ]
  }
}
```

### POST /api/collections/{namespace}/{slug}/items/batch

**Batch update items**

Batch update items in a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "update"
        ]
      },
      "_id": {
        "type": "string",
        "minLength": 24,
        "maxLength": 24,
        "pattern": "^[0-9a-fA-F]{24}$"
      },
      "data": {
        "type": "object",
        "properties": {
          "gallery": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uri"
            }
          },
          "note": {
            "type": "string",
            "maxLength": 500
          },
          "position": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          }
        }
      }
    },
    "required": [
      "action",
      "_id",
      "data"
    ]
  }
}
```

### PATCH /api/collections/{namespace}/{slug}-{id}/items/{itemId}

**Update item**

Update an item in a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |
| itemId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "gallery": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      }
    },
    "note": {
      "type": "string",
      "maxLength": 500
    },
    "position": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    }
  }
}
```

### DELETE /api/collections/{namespace}/{slug}-{id}/items/{itemId}

**Delete item**

Delete an item from a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |
| itemId | path | string | Yes |  |

### PATCH /api/collections/{namespace}/{slug}/items/{slug}

**Update item**

Update an item in a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "gallery": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      }
    },
    "note": {
      "type": "string",
      "maxLength": 500
    },
    "position": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    }
  }
}
```

### DELETE /api/collections/{namespace}/{slug}/items/{slug}

**Delete item**

Delete an item from a collection

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| slug | path | string | Yes |  |

### POST /api/collections

**Create a collection**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "description": {
      "type": "string",
      "maxLength": 150
    },
    "namespace": {
      "type": "string"
    },
    "item": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "paper",
            "collection",
            "space",
            "model",
            "dataset",
            "bucket"
          ]
        },
        "id": {
          "type": "string"
        }
      },
      "required": [
        "type",
        "id"
      ]
    },
    "private": {
      "description": "If not provided, the collection will be public. This field will respect the organization's visibility setting.",
      "type": "boolean"
    },
    "resourceGroupId": {
      "description": "Assign the collection to a resource group of the owning organization. Only valid for organization-owned collections.",
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    }
  },
  "required": [
    "title",
    "namespace"
  ]
}
```

**Responses:**

- **200**: The created collection
- **409**: The collection already exists

### GET /api/collections

**Get collections**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| item | query | string | No |  |
| owner | query | string | No |  |
| q | query | string | No |  |
| sort | query | string | No |  |
| cursor | query | string | No |  |
| expand | query | string | No |  |
| limit | query | number | No |  |

**Responses:**

- **200**: The collection data

### GET /api/collections/{namespace}/{slug}-{id}/resource-group

**Collection resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Responses:**

- **200**: The resource group the collection currently belongs to

### POST /api/collections/{namespace}/{slug}-{id}/resource-group

**Collection resource group**

Assign, move, or unassign an organization-owned collection to a resource group. Pass null to unassign. User-owned collections are not eligible.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |
| id | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to assign the collection to. If null, the collection is removed from any resource group."
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the collection after the assignment

### GET /api/collections/{namespace}/{slug}/resource-group

**Collection resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Responses:**

- **200**: The resource group the collection currently belongs to

### POST /api/collections/{namespace}/{slug}/resource-group

**Collection resource group**

Assign, move, or unassign an organization-owned collection to a resource group. Pass null to unassign. User-owned collections are not eligible.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| slug | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to assign the collection to. If null, the collection is removed from any resource group."
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the collection after the assignment

## Buckets

Git-free storage buckets for files, powered by Xet. Buckets provide simple file storage without git versioning.

### POST /api/buckets/{namespace}/{repo}/lfs-files/duplicate

**Duplicate xet files**

Duplicate xet-stored files from this repo (source) into another repo (target) by xet hash, without re-uploading file bytes. The caller must then commit the files with their sha256/size as usual.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "target": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "model",
            "space",
            "dataset",
            "kernel"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "type",
        "name"
      ]
    },
    "files": {
      "minItems": 1,
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "xetHash": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "sha256": {
            "type": "string",
            "minLength": 64,
            "maxLength": 64,
            "pattern": "^[0-9a-fA-F]{64}$"
          },
          "filename": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "xetHash",
          "sha256"
        ]
      }
    }
  },
  "required": [
    "target",
    "files"
  ]
}
```

**Responses:**

- **200**: Duplicate xet files response
- **207**: Duplicate xet files response

### GET /api/buckets/{namespace}/{repo}/xet-write-token

**Xet write token**

Get a write short-lived access token for XET upload

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetWriteAccessToken endpoint.

### GET /api/buckets/{namespace}/{repo}/xet-read-token

**Xet read token**

Get a read short-lived access token for XET

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetReadAccessToken endpoint.

### POST /api/buckets/{namespace}/{repo}/resource-group

**Add resource group**

Add the repository to a resource group

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceGroupId": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 24,
          "maxLength": 24,
          "pattern": "^[0-9a-fA-F]{24}$"
        },
        {
          "type": "null"
        }
      ],
      "description": "The resource group to add the repository to, if null, the repository will be removed from the resource group"
    }
  },
  "required": [
    "resourceGroupId"
  ]
}
```

**Responses:**

- **200**: Minimal information about the repository

### GET /api/buckets/{namespace}/{repo}/resource-group

**Get resource group**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The resource group of the repository

### POST /api/buckets/{namespace}/{repo}

**Create bucket**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "description": "Bucket visibility. Defaults to public. Cannot be specified along with visibility.",
      "type": [
        "boolean",
        "null"
      ]
    },
    "visibility": {
      "description": "Bucket visibility. Cannot be specified along with private.",
      "type": "string",
      "enum": [
        "private",
        "public"
      ]
    },
    "resourceGroupId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "cdn": {
      "description": "CDN pre-warming regions",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "gcp",
              "aws"
            ]
          },
          "region": {
            "type": "string",
            "enum": [
              "us",
              "eu"
            ]
          }
        },
        "required": [
          "provider",
          "region"
        ]
      }
    },
    "region": {
      "description": "The region where the bucket is hosted.",
      "type": "string",
      "enum": [
        "us",
        "eu"
      ]
    },
    "description": {
      "description": "Free-text description.",
      "type": "string",
      "maxLength": 500
    }
  },
  "description": "Bucket creation options"
}
```

**Responses:**

- **200**: Bucket created, url is given
- **409**: Bucket already exists, url is given

### DELETE /api/buckets/{namespace}/{repo}

**Delete bucket**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### GET /api/buckets/{namespace}/{repo}

**Get bucket details**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Bucket overview information

### PUT /api/buckets/{namespace}/{repo}/settings

**Update bucket settings**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "type": [
        "boolean",
        "string"
      ]
    },
    "cdnRegions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "gcp",
              "aws"
            ]
          },
          "region": {
            "type": "string",
            "enum": [
              "us",
              "eu"
            ]
          }
        },
        "required": [
          "provider",
          "region"
        ]
      }
    }
  }
}
```

**Responses:**

- **200**: The updated bucket settings.

### GET /api/buckets/{namespace}

**List namespace buckets**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| search | query | string | No |  |

**Responses:**

- **200**: List of buckets

### GET /buckets/{namespace}/{repo}/resolve/{path}

**Get file metadata**

Returns file metadata including size, hash, and links to XET authentication

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| noContentDisposition | query | string | No |  |
| download | query | string | No |  |
| Accept | header | string | No | Returns json information about the XET file info |

**Responses:**

- **200**: XET file info returned when the Accept header is set to `application/vnd.xet-fileinfo+json`. Otherwise, a 302 redirect is returned.
- **302**: Redirection to file on the xet bridge (default when no specific Accept header is set)
- **400**: File path required
- **404**: Bucket or file not found

### POST /api/buckets/{namespace}/{repo}/batch

**Batch file operations**

Accepts NDJSON (newline-delimited JSON) where each line is an addFile, copyFile, or deleteFile instruction.
All add/copy operations must come before all delete operations.

JSON-lines payload:
```json
	'{"type":"addFile","path":"...","xetHash":"...","mtime":...,"mtimeNanos":...,"contentType":"..."}' +
	'{"type":"copyFile","path":"...","xetHash":"...","sourceRepoType":"...","sourceRepoId":"...","mtime":...,"mtimeNanos":...,"contentType":"..."}' +
	'{"type":"deleteFile","path":"..."}'
```

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Batch operation status
- **422**: Batch operation status

### GET /api/buckets/{namespace}/{repo}/tree/{path}

**List files**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| limit | query | integer | No |  |
| cursor | query | string | No | Pagination cursor |
| recursive | query | string | No | When false, returns collapsed directory entries instead of listing all files recursively. The number of entries returned can then be less than the limit, but there will always be a pagination link if there are more entries. Note: non-recursive listing hasn't a strong consistency guarantees. |
| sort | query | string | No | Sort order. `path` (default) sorts lexicographically; `uploadedAt` sorts by most recent upload first. In recursive mode `uploadedAt` is only supported at the bucket root (no path prefix). In non-recursive mode, only supported at root or exact folder prefixes. |
| direction | query | string | No | Sort direction. Defaults to `asc` for `path` and `desc` for `uploadedAt`. |

**Responses:**

- **200**: List of files and directories

### GET /api/buckets/{namespace}/{repo}/events

**Follow changes**

Server-sent events (`Accept: text/event-stream`) of the bucket's file changes, so clients can stop polling `/tree`.

Events:
- `ready`: `{"cursor"}` — replay (if any) is done, live changes follow. `cursor` may be absent if the feed has seen no change yet.
- `changes`: `{"cursor", "changes": [{"path", "op": "add" | "update" | "delete", "size"?, "xetHash"?, "uploadedAt"?, "mtime"?, "mtimeNanos"?}]}` — a batch of changes coalesced over ~200ms. An `update` only carries the fields that changed (an identical re-upload has just `uploadedAt`); `mtime`/`mtimeNanos` are `null` when a re-upload cleared them. `xetHash` is omitted without content read access.
- `reset`: `{"reason": "cursor_too_old"}` — the requested `cursor`/`since` is older than what the server buffers (about 15 minutes); the stream ends and the client must re-list. A `since` at or after the bucket's `updatedAt` never resets, however old.
- `reconnect`: `{"cursor"}` — sent after 20 minutes or when the server shuts down (deploys), then the stream ends; reconnect with that cursor. Treat any other end of the stream the same way: reconnect with the last cursor you received.

A `: ping` comment is sent every 30s. Resume with `?cursor=` (exclusive) or `?since=` (inclusive); without either, only live changes are sent.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| cursor | query | string | No | Opaque cursor from a previous `ready`/`changes` event; resume after it |
| since | query | string | No | Resume from this instant instead of a cursor (e.g. the bucket's `updatedAt` you last saw) |

**Responses:**

- **503**: Live follow is not served by this instance, or not caught up yet; retry after `Retry-After` seconds

### POST /api/buckets/{namespace}/{repo}/paths-info

**List paths info**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paths": {
      "anyOf": [
        {
          "maxItems": 2000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "string"
        }
      ]
    }
  },
  "required": [
    "paths"
  ]
}
```

**Responses:**

- **200**: List of found files (missing paths are omitted)

## Containers

Container image repositories, usable with the Hugging Face container registry (`docker push` / `docker pull`). Backed by bucket storage: the file endpoints mirror the bucket ones. Also includes the registry token endpoint used by `docker login`.

### GET /api/registry/token

**Registry token**

Mints a short-lived EdDSA JWT for the HuggingFace container registry, verifiable via the JWK at `/api/keys/jwt`.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| service | query | string | Yes | Registry service identifier — placed in the JWT `aud` claim. |
| scope | query | string | No | Docker Distribution scope(s), e.g. `repository:org/img:push,pull`. May be repeated. |

**Responses:**

- **200**: Docker Distribution v2 token response — see https://distribution.github.io/distribution/spec/auth/jwt/

### GET /api/containers/{namespace}/{repo}/xet-write-token

**Xet write token**

Get a write short-lived access token for XET upload

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetWriteAccessToken endpoint.

### GET /api/containers/{namespace}/{repo}/xet-read-token

**Xet read token**

Get a read short-lived access token for XET

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: The response from the getXetReadAccessToken endpoint.

### POST /api/containers/{namespace}/{repo}

**Create bucket**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "description": "Bucket visibility. Defaults to public. Cannot be specified along with visibility.",
      "type": [
        "boolean",
        "null"
      ]
    },
    "visibility": {
      "description": "Bucket visibility. Cannot be specified along with private.",
      "type": "string",
      "enum": [
        "private",
        "public"
      ]
    },
    "resourceGroupId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    },
    "cdn": {
      "description": "CDN pre-warming regions",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "gcp",
              "aws"
            ]
          },
          "region": {
            "type": "string",
            "enum": [
              "us",
              "eu"
            ]
          }
        },
        "required": [
          "provider",
          "region"
        ]
      }
    },
    "region": {
      "description": "The region where the bucket is hosted.",
      "type": "string",
      "enum": [
        "us",
        "eu"
      ]
    },
    "description": {
      "description": "Free-text description.",
      "type": "string",
      "maxLength": 500
    }
  },
  "description": "Bucket creation options"
}
```

**Responses:**

- **200**: Bucket created, url is given
- **409**: Bucket already exists, url is given

### DELETE /api/containers/{namespace}/{repo}

**Delete bucket**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

### GET /api/containers/{namespace}/{repo}

**Get bucket details**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Bucket overview information

### PUT /api/containers/{namespace}/{repo}/settings

**Update bucket settings**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "private": {
      "type": [
        "boolean",
        "string"
      ]
    },
    "cdnRegions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "gcp",
              "aws"
            ]
          },
          "region": {
            "type": "string",
            "enum": [
              "us",
              "eu"
            ]
          }
        },
        "required": [
          "provider",
          "region"
        ]
      }
    }
  }
}
```

**Responses:**

- **200**: The updated bucket settings.

### DELETE /api/containers/{namespace}/{repo}/tags/{tag}

**Delete tag**

Deletes a single tag from a container image. The underlying image data is untouched.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| tag | path | string | Yes |  |

### GET /api/containers/{namespace}

**List namespace buckets**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| search | query | string | No |  |

**Responses:**

- **200**: List of buckets

### GET /containers/{namespace}/{repo}/resolve/{path}

**Get file metadata**

Returns file metadata including size, hash, and links to XET authentication

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| noContentDisposition | query | string | No |  |
| download | query | string | No |  |
| Accept | header | string | No | Returns json information about the XET file info |

**Responses:**

- **200**: XET file info returned when the Accept header is set to `application/vnd.xet-fileinfo+json`. Otherwise, a 302 redirect is returned.
- **302**: Redirection to file on the xet bridge (default when no specific Accept header is set)
- **400**: File path required
- **404**: Bucket or file not found

### POST /api/containers/{namespace}/{repo}/batch

**Batch file operations**

Accepts NDJSON (newline-delimited JSON) where each line is an addFile, copyFile, or deleteFile instruction.
All add/copy operations must come before all delete operations.

JSON-lines payload:
```json
	'{"type":"addFile","path":"...","xetHash":"...","mtime":...,"mtimeNanos":...,"contentType":"..."}' +
	'{"type":"copyFile","path":"...","xetHash":"...","sourceRepoType":"...","sourceRepoId":"...","mtime":...,"mtimeNanos":...,"contentType":"..."}' +
	'{"type":"deleteFile","path":"..."}'
```

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Responses:**

- **200**: Batch operation status
- **422**: Batch operation status

### GET /api/containers/{namespace}/{repo}/tree/{path}

**List files**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |
| path | path | string | Yes | Wildcard path parameter |
| limit | query | integer | No |  |
| cursor | query | string | No | Pagination cursor |
| recursive | query | string | No | When false, returns collapsed directory entries instead of listing all files recursively. The number of entries returned can then be less than the limit, but there will always be a pagination link if there are more entries. Note: non-recursive listing hasn't a strong consistency guarantees. |
| sort | query | string | No | Sort order. `path` (default) sorts lexicographically; `uploadedAt` sorts by most recent upload first. In recursive mode `uploadedAt` is only supported at the bucket root (no path prefix). In non-recursive mode, only supported at root or exact folder prefixes. |
| direction | query | string | No | Sort direction. Defaults to `asc` for `path` and `desc` for `uploadedAt`. |

**Responses:**

- **200**: List of files and directories

### POST /api/containers/{namespace}/{repo}/paths-info

**List paths info**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| repo | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "paths": {
      "anyOf": [
        {
          "maxItems": 2000,
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "string"
        }
      ]
    }
  },
  "required": [
    "paths"
  ]
}
```

**Responses:**

- **200**: List of found files (missing paths are omitted)

## Notifications

The following endpoints fetch Hub notifications.

### GET /api/notifications

**List notifications**

List notifications for the user

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| p | query | integer | No |  |
| readStatus | query | string | No |  |
| repoType | query | string | No |  |
| repoName | query | string | No |  |
| postAuthor | query | string | No |  |
| paperId | query | string | No |  |
| articleId | query | string | No |  |
| mention | query | string | No |  |
| lastUpdate | query | string | No |  |

**Responses:**

- **200**: The notifications for the user

### DELETE /api/notifications

**Delete notifications**

Delete notifications, either by specifying discussionIds or by applying to all notifications with search parameters

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| p | query | integer | No |  |
| readStatus | query | string | No |  |
| repoType | query | string | No |  |
| repoName | query | string | No |  |
| postAuthor | query | string | No |  |
| paperId | query | string | No |  |
| articleId | query | string | No |  |
| mention | query | string | No |  |
| lastUpdate | query | string | No |  |
| applyToAll | query | string | No |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "discussionIds": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 24,
        "maxLength": 24,
        "pattern": "^[0-9a-fA-F]{24}$"
      }
    }
  }
}
```

### POST /api/notifications/mark-as-read

**Change read status**

Mark discussions as read or unread. If `applyToAll` is true, all notifications for the user matching the search parameters will be marked as read or unread.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| p | query | integer | No |  |
| readStatus | query | string | No |  |
| repoType | query | string | No |  |
| repoName | query | string | No |  |
| postAuthor | query | string | No |  |
| paperId | query | string | No |  |
| articleId | query | string | No |  |
| mention | query | string | No |  |
| lastUpdate | query | string | No |  |
| applyToAll | query | string | No |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "discussionIds": {
      "default": [],
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "read": {
      "default": true,
      "type": "boolean"
    }
  }
}
```

### PATCH /api/settings/notifications

**Update notification settings**

Update notification settings for the user

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "notifications": {
      "type": "object",
      "properties": {
        "announcements": {
          "type": "boolean"
        },
        "arxiv_paper_activity": {
          "type": "boolean"
        },
        "content_access_policy_request": {
          "type": "boolean"
        },
        "daily_papers_digest": {
          "type": "boolean"
        },
        "discussions_participating": {
          "type": "boolean"
        },
        "discussions_watched": {
          "type": "boolean"
        },
        "gated_user_access_request": {
          "type": "boolean"
        },
        "inference_endpoint_status": {
          "type": "boolean"
        },
        "job_status": {
          "type": "boolean"
        },
        "launch_autonlp": {
          "type": "boolean"
        },
        "launch_spaces": {
          "type": "boolean"
        },
        "launch_prepaid_credits": {
          "type": "boolean"
        },
        "launch_training_cluster": {
          "type": "boolean"
        },
        "org_request": {
          "type": "boolean"
        },
        "org_suggestions": {
          "type": "boolean"
        },
        "org_verified_suggestions": {
          "type": "boolean"
        },
        "org_suggestions_to_create": {
          "type": "boolean"
        },
        "posts_participating": {
          "type": "boolean"
        },
        "user_follows": {
          "type": "boolean"
        },
        "secret_detected": {
          "type": "boolean"
        },
        "web_discussions_participating": {
          "type": "boolean"
        },
        "web_discussions_watched": {
          "type": "boolean"
        },
        "web_posts_participating": {
          "type": "boolean"
        },
        "product_updates_after": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "api_inference_sunset": {
          "type": "boolean"
        },
        "locked_out": {
          "type": "boolean"
        },
        "repo_release": {
          "type": "boolean"
        }
      }
    },
    "prepaidAmount": {
      "description": "To be provided when enabling launch_prepaid_credits",
      "type": "string",
      "maxLength": 24
    }
  },
  "required": [
    "notifications"
  ]
}
```

### PATCH /api/settings/watch

**Update watch settings**

Update watch settings for the user. Get notified when discussions happen on your watched items.

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "delete": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "org",
              "user",
              "repo"
            ]
          }
        },
        "required": [
          "id",
          "type"
        ]
      }
    },
    "add": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "org",
              "user",
              "repo"
            ]
          }
        },
        "required": [
          "id",
          "type"
        ]
      }
    }
  }
}
```

## Inference Providers

Run inference from one of our inference providers.

### POST /api/settings/inference-providers

**Reorder inference providers**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "propertyNames": {
    "type": "string",
    "enum": [
      "baseten",
      "cohere",
      "cerebras",
      "deepinfra",
      "fal-ai",
      "featherless-ai",
      "fireworks-ai",
      "groq",
      "hf-inference",
      "novita",
      "nscale",
      "openrouter",
      "ovhcloud",
      "publicai",
      "replicate",
      "scaleway",
      "together",
      "wavespeed",
      "zai-org"
    ]
  },
  "additionalProperties": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean"
      },
      "position": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    },
    "required": [
      "enabled",
      "position"
    ]
  }
}
```

### POST /api/settings/inference-providers/api-key

**Set provider key**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "baseten",
        "cohere",
        "cerebras",
        "deepinfra",
        "fal-ai",
        "featherless-ai",
        "fireworks-ai",
        "groq",
        "novita",
        "nscale",
        "openrouter",
        "ovhcloud",
        "publicai",
        "replicate",
        "scaleway",
        "together",
        "wavespeed",
        "zai-org"
      ]
    },
    "apiKey": {
      "type": "string",
      "maxLength": 1024
    }
  },
  "required": [
    "provider",
    "apiKey"
  ]
}
```

### PUT /api/settings/inference-providers/default-billing-entity

**Default billing entity**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "orgId": {
      "type": "string",
      "minLength": 24,
      "maxLength": 24,
      "pattern": "^[0-9a-fA-F]{24}$"
    }
  }
}
```

### PUT /api/settings/inference-providers/usage-limits

**Set spending limit**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "spendingLimitCents": {
      "type": "integer",
      "minimum": 0,
      "maximum": 200000
    }
  },
  "required": [
    "spendingLimitCents"
  ]
}
```

### GET /api/partners/{provider}/models

**List provider mappings**

List the model mappings of an inference provider.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| provider | path | string | Yes |  |
| status | query | string | No |  |

### POST /api/partners/{provider}/models

**Create provider mapping**

Register a model mapping for your inference provider. Requires a write token of the provider organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| provider | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "type": {
          "default": "single-model",
          "type": "string",
          "const": "single-model"
        },
        "hfModel": {
          "type": "string",
          "maxLength": 96
        },
        "providerModel": {
          "type": "string",
          "maxLength": 128
        },
        "status": {
          "default": "staging",
          "type": "string",
          "enum": [
            "live",
            "staging",
            "error"
          ]
        },
        "task": {
          "type": "string",
          "enum": [
            "conversational",
            "text-classification",
            "token-classification",
            "table-question-answering",
            "question-answering",
            "zero-shot-classification",
            "translation",
            "summarization",
            "feature-extraction",
            "text-generation",
            "fill-mask",
            "sentence-similarity",
            "text-to-speech",
            "text-to-audio",
            "automatic-speech-recognition",
            "audio-to-audio",
            "audio-classification",
            "audio-text-to-text",
            "voice-activity-detection",
            "depth-estimation",
            "image-classification",
            "object-detection",
            "image-segmentation",
            "text-to-image",
            "image-to-text",
            "image-to-image",
            "image-to-video",
            "unconditional-image-generation",
            "video-classification",
            "reinforcement-learning",
            "robotics",
            "tabular-classification",
            "tabular-regression",
            "tabular-to-text",
            "table-to-text",
            "multiple-choice",
            "text-ranking",
            "text-retrieval",
            "time-series-forecasting",
            "text-to-video",
            "image-text-to-text",
            "image-text-to-image",
            "image-text-to-video",
            "visual-question-answering",
            "document-question-answering",
            "zero-shot-image-classification",
            "graph-ml",
            "mask-generation",
            "zero-shot-object-detection",
            "text-to-3d",
            "image-to-3d",
            "image-feature-extraction",
            "video-text-to-text",
            "keypoint-detection",
            "visual-document-retrieval",
            "any-to-any",
            "video-to-video"
          ]
        }
      },
      "required": [
        "hfModel",
        "providerModel",
        "task"
      ]
    },
    {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "tag-filter"
        },
        "providerModel": {
          "type": "string",
          "maxLength": 128
        },
        "status": {
          "default": "staging",
          "type": "string",
          "enum": [
            "live",
            "staging",
            "error"
          ]
        },
        "task": {
          "type": "string",
          "enum": [
            "conversational",
            "text-classification",
            "token-classification",
            "table-question-answering",
            "question-answering",
            "zero-shot-classification",
            "translation",
            "summarization",
            "feature-extraction",
            "text-generation",
            "fill-mask",
            "sentence-similarity",
            "text-to-speech",
            "text-to-audio",
            "automatic-speech-recognition",
            "audio-to-audio",
            "audio-classification",
            "audio-text-to-text",
            "voice-activity-detection",
            "depth-estimation",
            "image-classification",
            "object-detection",
            "image-segmentation",
            "text-to-image",
            "image-to-text",
            "image-to-image",
            "image-to-video",
            "unconditional-image-generation",
            "video-classification",
            "reinforcement-learning",
            "robotics",
            "tabular-classification",
            "tabular-regression",
            "tabular-to-text",
            "table-to-text",
            "multiple-choice",
            "text-ranking",
            "text-retrieval",
            "time-series-forecasting",
            "text-to-video",
            "image-text-to-text",
            "image-text-to-image",
            "image-text-to-video",
            "visual-question-answering",
            "document-question-answering",
            "zero-shot-image-classification",
            "graph-ml",
            "mask-generation",
            "zero-shot-object-detection",
            "text-to-3d",
            "image-to-3d",
            "image-feature-extraction",
            "video-text-to-text",
            "keypoint-detection",
            "visual-document-retrieval",
            "any-to-any",
            "video-to-video"
          ]
        },
        "tags": {
          "minItems": 1,
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 128
          }
        },
        "adapterType": {
          "type": "string",
          "const": "lora"
        }
      },
      "required": [
        "type",
        "providerModel",
        "task",
        "tags",
        "adapterType"
      ]
    }
  ]
}
```

### PUT /api/partners/{provider}/models/{mappingId}/status

**Update mapping status**

Update the status of one of your inference provider's model mappings.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| provider | path | string | Yes |  |
| mappingId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "live",
        "staging",
        "error"
      ]
    }
  },
  "required": [
    "status"
  ]
}
```

## Inference Endpoints

Manage inference endpoints.

### POST /api/inference-endpoints/{namespace}/auth-check/{perms}

**Check access**

Check if the user has access to the inference endpoint

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| perms | path | string | Yes |  |
| own | query | string | No |  |
| is_creator | query | string | No |  |
| creator_id | query | string | No |  |
| incur_cost | query | string | No |  |
| resource_group_id | query | string | No |  |
| repo_id | query | string | No |  |

**Responses:**

- **200**: The user has access to the inference endpoint/resource
- **207**: The user has access to the resource, but the endpoint name is restricted by pattern restrictions. Can only be returned if `endpoint` is not provided in the path

### POST /api/inference-endpoints/{namespace}/{endpoint}/auth-check/{perms}

**Check access**

Check if the user has access to the inference endpoint

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| namespace | path | string | Yes |  |
| endpoint | path | string | Yes |  |
| perms | path | string | Yes |  |
| own | query | string | No |  |
| is_creator | query | string | No |  |
| creator_id | query | string | No |  |
| incur_cost | query | string | No |  |
| resource_group_id | query | string | No |  |
| repo_id | query | string | No |  |

**Responses:**

- **200**: The user has access to the inference endpoint/resource
- **207**: The user has access to the resource, but the endpoint name is restricted by pattern restrictions. Can only be returned if `endpoint` is not provided in the path

## OAuth

The following endpoints are for use with OAuth.

### POST /oauth/register

**Register OAuth app**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "redirect_uris": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      }
    },
    "client_name": {
      "type": "string"
    },
    "client_uri": {
      "type": "string",
      "format": "uri"
    },
    "logo_uri": {
      "type": "string",
      "format": "uri"
    },
    "scope": {
      "type": "string"
    },
    "contacts": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "token_endpoint_auth_method": {
      "type": "string",
      "enum": [
        "client_secret_basic",
        "none",
        "client_secret_post"
      ]
    },
    "software_id": {
      "type": "string"
    },
    "software_version": {
      "type": "string"
    }
  }
}
```

**Responses:**

- **201**: Details of the OAuth app that was created

### POST /oauth/device

**Initiate device authorization**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "client_id": {
      "type": "string"
    },
    "scope": {
      "type": "string"
    }
  },
  "required": [
    "client_id"
  ],
  "description": "Initiate device authorization as per https://datatracker.ietf.org/doc/html/rfc8628#section-3.1"
}
```

**Responses:**

- **200**: Details of the device code that was created as per https://datatracker.ietf.org/doc/html/rfc8628#section-3.2

### GET /oauth/userinfo

**Get user info**

Get information about the user. Only available through oauth access tokens. Information varies depending on the scope of the oauth app and what permissions the user granted to the oauth app.

**Responses:**

- **200**: User info

### POST /oauth/userinfo

**Get user info**

Get information about the user. Only available through oauth access tokens. Information varies depending on the scope of the oauth app and what permissions the user granted to the oauth app.

**Responses:**

- **200**: User info

## Documentation

The following endpoints are for interacting with the Hub's documentation.

### GET /api/docs

**List docs**

Get list of available documentation

**Responses:**

- **200**: List of available documentation

### GET /api/docs/search

**Search docs**

Search any Hugging Face documentation

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | Yes |  |
| product | query | string | No |  |
| limit | query | integer | No |  |

**Responses:**

- **200**: Search results

### GET /api/docs/search/full-text

**Full-text search docs**

Full-text search across Hugging Face documentation

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| q | query | string | Yes |  |
| limit | query | integer | No |  |
| domain | query | string | No |  |

**Responses:**

- **200**: Full-text search results

## Webhooks

The following endpoints are for use with webhooks.

### GET /api/settings/webhooks

**List webhooks**

**Responses:**

- **200**: Webhooks

### POST /api/settings/webhooks

**Create webhook**

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "watched": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "dataset",
              "model",
              "space",
              "bucket",
              "kernel",
              "container",
              "user",
              "org"
            ]
          },
          "name": {
            "type": "string"
          }
        },
        "required": [
          "type",
          "name"
        ]
      }
    },
    "url": {
      "type": "string",
      "format": "uri"
    },
    "job": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "dockerImage": {
              "type": "string"
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "spaceId"
          ]
        },
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "type": "string"
            },
            "dockerImage": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "dockerImage"
          ]
        }
      ]
    },
    "jobSourceId": {
      "type": "string"
    },
    "secrets": {
      "description": "Secrets of the job started by the webhook, used together with `jobSourceId`: the source job's own secrets are never copied. On update, listed keys are replaced, an empty value removes a secret, and omitted keys keep their stored value.",
      "type": "object",
      "propertyNames": {
        "type": "string",
        "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
      },
      "additionalProperties": {
        "type": "string"
      }
    },
    "domains": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo",
          "discussion"
        ]
      }
    },
    "secret": {
      "type": "string",
      "pattern": "^[\\x20-\\x7F]*$"
    }
  },
  "required": [
    "watched",
    "domains"
  ]
}
```

**Responses:**

- **200**: Created webhook

### GET /api/settings/webhooks/{webhookId}

**Get webhook**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| webhookId | path | string | Yes |  |

**Responses:**

- **200**: Webhook

### POST /api/settings/webhooks/{webhookId}

**Update webhook**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| webhookId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "watched": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "dataset",
              "model",
              "space",
              "bucket",
              "kernel",
              "container",
              "user",
              "org"
            ]
          },
          "name": {
            "type": "string"
          }
        },
        "required": [
          "type",
          "name"
        ]
      }
    },
    "url": {
      "type": "string",
      "format": "uri"
    },
    "job": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "dockerImage": {
              "type": "string"
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "spaceId"
          ]
        },
        {
          "type": "object",
          "properties": {
            "spaceId": {
              "type": "string"
            },
            "dockerImage": {
              "allOf": [
                {
                  "type": "string"
                },
                {
                  "type": "string",
                  "minLength": 1
                }
              ]
            },
            "arguments": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "command": {
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1
              }
            },
            "environment": {
              "default": {},
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]+$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "secrets": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
              },
              "additionalProperties": {
                "type": "string"
              }
            },
            "flavor": {
              "type": "string",
              "enum": [
                "cpu-basic",
                "cpu-upgrade",
                "cpu-performance",
                "cpu-xl",
                "sprx8",
                "zero-a10g",
                "t4-small",
                "t4-medium",
                "l4x1",
                "l4x4",
                "l40sx1",
                "l40sx4",
                "l40sx8",
                "a10g-small",
                "a10g-large",
                "a10g-largex2",
                "a10g-largex4",
                "a100-large",
                "a100x4",
                "a100x8",
                "h200",
                "h200x2",
                "h200x4",
                "h200x8",
                "rtx-pro-6000",
                "rtx-pro-6000x2",
                "rtx-pro-6000x4",
                "rtx-pro-6000x8",
                "inf2x6"
              ]
            },
            "arch": {
              "type": "string",
              "enum": [
                "amd64",
                "arm64"
              ]
            },
            "timeoutSeconds": {
              "default": null,
              "anyOf": [
                {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                {
                  "type": "null"
                }
              ]
            },
            "attempts": {
              "default": 1,
              "description": "Max number of attempts to make. For example, if you set this to 3, the job will be retried up to 2 times if it fails.",
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "labels": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "additionalProperties": {
                "type": "string",
                "maxLength": 100,
                "pattern": "^[a-zA-Z0-9_-]*$"
              },
              "description": "Labels for the job as key-value pairs. Both keys and values must be max 100 characters and contain only alphanumeric characters, dashes, and underscores."
            },
            "volumes": {
              "description": "HuggingFace Buckets or Repos to mount as volumes in the job container.",
              "minItems": 1,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "bucket",
                      "model",
                      "dataset",
                      "space"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Source identifier, e.g. 'username/my-bucket' or 'username/my-model'"
                  },
                  "mountPath": {
                    "type": "string",
                    "format": "starts_with",
                    "pattern": "^\\/.*",
                    "description": "Mount path inside the container, e.g. '/data'"
                  },
                  "revision": {
                    "description": "Git revision (only for repos, defaults to 'main')",
                    "type": "string"
                  },
                  "readOnly": {
                    "description": "Read-only mount (true for repos, false default for buckets)",
                    "type": "boolean"
                  },
                  "path": {
                    "description": "Subfolder prefix inside the bucket/repo to mount, e.g. 'path/to/dir'",
                    "type": "string"
                  }
                },
                "required": [
                  "type",
                  "source",
                  "mountPath"
                ]
              }
            },
            "expose": {
              "description": "Ports to expose publicly through the jobs proxy. Each port is reachable at `https://<job_id>--<port>.<jobs-public-domain>`. Access requires a HF token with read access to the job's namespace, except for ports also listed in `portsPublic`.",
              "type": "object",
              "properties": {
                "ports": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                },
                "portsPublic": {
                  "description": "Subset of `ports` reachable without any authentication.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  }
                }
              },
              "required": [
                "ports"
              ]
            },
            "ssh": {
              "description": "When `enabled`, the job's container is reachable over SSH at `ssh <job_id>@ssh.hf.jobs`. Only the job's owner is allowed in, authenticated by an SSH public key registered on the Hub.",
              "type": "object",
              "properties": {
                "enabled": {
                  "default": false,
                  "type": "boolean"
                }
              }
            },
            "network": {
              "description": "Opt-in network group. Jobs of the same owner and resource group sharing a group are placed together and reach each other on every port. Two environment variables are set in the container: `HF_NETWORK_GROUP_HOSTNAME`, a hostname resolving to every member of the group, and `HF_NETWORK_GROUP_PREFIX`, to which an alias is appended to get that alias' hostname.",
              "type": "object",
              "properties": {
                "group": {
                  "type": "string",
                  "maxLength": 46,
                  "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
                  "description": "Group name, scoped to the job's owner and resource group."
                },
                "aliases": {
                  "default": [],
                  "description": "Roles this job answers to. An alias names a role, not a job: several members may claim the same alias, which then resolves to all of them, and a member may claim several. Peers get the hostname by appending the alias to the `HF_NETWORK_GROUP_PREFIX` environment variable, which already ends with a separator.",
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "maxLength": 34,
                    "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
                  }
                }
              },
              "required": [
                "group"
              ]
            },
            "resourceGroupId": {
              "type": "string",
              "minLength": 24,
              "maxLength": 24,
              "pattern": "^[0-9a-fA-F]{24}$"
            }
          },
          "required": [
            "flavor",
            "dockerImage"
          ]
        }
      ]
    },
    "jobSourceId": {
      "type": "string"
    },
    "secrets": {
      "description": "Secrets of the job started by the webhook, used together with `jobSourceId`: the source job's own secrets are never copied. On update, listed keys are replaced, an empty value removes a secret, and omitted keys keep their stored value.",
      "type": "object",
      "propertyNames": {
        "type": "string",
        "pattern": "^[a-zA-Z][_a-zA-Z0-9]*$"
      },
      "additionalProperties": {
        "type": "string"
      }
    },
    "domains": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "repo",
          "discussion"
        ]
      }
    },
    "secret": {
      "type": "string",
      "pattern": "^[\\x20-\\x7F]*$"
    }
  },
  "required": [
    "watched",
    "domains"
  ]
}
```

**Responses:**

- **200**: Updated webhook

### DELETE /api/settings/webhooks/{webhookId}

**Delete webhook**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| webhookId | path | string | Yes |  |

**Responses:**

- **200**: Deleted webhook

### POST /api/settings/webhooks/{webhookId}/{action}

**Enable/disable webhook**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| webhookId | path | string | Yes |  |
| action | path | string | Yes |  |

**Responses:**

- **200**: Updated webhook

### POST /api/settings/webhooks/{webhookId}/replay/{logId}

**Replay webhook log**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| webhookId | path | string | Yes |  |
| logId | path | string | Yes |  |

**Responses:**

- **200**: Replay response

## SCIM

Use the SCIM API to control and manage your hub Enterprise organization manage members' access.
## Authentication

- Must be organization owner
- Use Access token with write permission on organization
- Organization must be Enterprise Plus

## Key Attribute Matching

- Microsoft Entra ID (Azure AD)
	* SAML: `http://schemas.microsoft.com/identity/claims/objectidentifier`
	* SCIM: `externalId`
- Other Identity Providers
	* SAML: `NameID` or `unique identifier`
	* SCIM: `externalId`

## Supported SCIM User Attributes

| Attribute | Description |
|---|---|
| `userName` | Username for the user |
| `name.givenName` | First name |
| `name.familyName` | Last name |
| `emails` | Array of user emails; we don't support email types |
| `externalId` | IDP provider's unique identifier |
| `id` | Hugging Face SCIM endpoint identifier |
| `active` | Boolean for provisioning status |



### GET /api/organizations/{name}/scim/v2/ServiceProviderConfig

**Get SCIM Configuration**

**Requires plan:** Enterprise Plus

Returns the SCIM 2.0 Service Provider configuration, describing the server's capabilities and supported authentication schemes.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: SCIM Service Provider Configuration

### GET /api/organizations/{name}/scim/v2/ResourceTypes

**SCIM resource types**

**Requires plan:** Enterprise Plus

Returns the list of SCIM 2.0 resource types supported by this server (User and Group).

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: SCIM Resource Types

### GET /api/organizations/{name}/scim/v2/Schemas

**Get SCIM Schemas**

**Requires plan:** Enterprise Plus

Returns the SCIM 2.0 schema definitions for User and Group resources.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Responses:**

- **200**: SCIM Schema Definitions

### GET /api/organizations/{name}/scim/v2/Schemas/{schemaId}

**Get SCIM schema**

**Requires plan:** Enterprise Plus

Returns a single SCIM 2.0 schema definition by its schema URI.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| schemaId | path | string | Yes |  |

**Responses:**

- **200**: SCIM Schema Definition

### GET /api/organizations/{name}/scim/v2/Users

**List SCIM users**

**Requires plan:** Enterprise Plus

Retrieves a paginated list of all organization members who have been set up, including disabled users. If you provide the filter parameter, the resources for all matching members are returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startIndex | query | number | No |  |
| count | query | number | No |  |
| filter | query | string | No | You can filter results using the equals operator (eq) to find items that match specific values like `id`, `userName`, `emails`, and `externalId`. For example, to find a user named Bob, use this search: `?filter=userName%20eq%20Bob` |

**Responses:**

- **200**: SCIM User List

### POST /api/organizations/{name}/scim/v2/Users

**Create SCIM user**

**Requires plan:** Enterprise Plus

Creates a new user in the organization. If the user already exists, only `active` field will be updated to provision the user.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:User"
        ]
      ]
    },
    "userName": {
      "type": "string",
      "minLength": 2,
      "maxLength": 42,
      "pattern": "^\\b(?!\\d+$)(?![0-9a-fA-F]{24}$)([a-zA-Z0-9]|-(?!-))+\\b$",
      "description": "Username for the user, it should respect the hub rules: No consecutive dashes, No digit-only, Does not start or end with a dash, Only dashes, letters or numbers, Not 24 chars hex string"
    },
    "emails": {
      "minItems": 1,
      "maxItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "format": "email",
            "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
          }
        },
        "required": [
          "value"
        ]
      }
    },
    "name": {
      "type": "object",
      "properties": {
        "givenName": {
          "type": "string",
          "minLength": 1
        },
        "familyName": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "givenName",
        "familyName"
      ]
    },
    "active": {
      "default": true,
      "type": "boolean"
    },
    "externalId": {
      "type": "string",
      "description": "External ID for the user, it must be unique within the organization and is required for managed users"
    }
  },
  "required": [
    "schemas",
    "userName",
    "emails",
    "name",
    "externalId"
  ]
}
```

**Responses:**

- **201**: SCIM User
- **409**: SCIM User already exists

### GET /api/organizations/{name}/scim/v2/Users/{userId}

**Get SCIM user**

**Requires plan:** Enterprise Plus

Retrieves a SCIM user by their ID.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Responses:**

- **200**: SCIM User

### PATCH /api/organizations/{name}/scim/v2/Users/{userId}

**Update SCIM user**

**Requires plan:** Enterprise Plus

Update an attribute of a SCIM user. Modify individual attributes using Operations format. Just provide the changes you want to make using add, remove (only `externalId` is supported), or replace operations.
 If you set `active` to `false`, the user will be deprovisioned from the organization. 
Complicated SCIM `path` values are not supported like `emails[type eq 'work'].value`.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:api:messages:2.0:PatchOp"
      },
      "examples": [
        [
          "urn:ietf:params:scim:api:messages:2.0:PatchOp"
        ]
      ]
    },
    "Operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "op": {
            "type": "string"
          },
          "path": {
            "type": "string",
            "enum": [
              "active",
              "externalId",
              "userName",
              "emails[type eq \"work\"].value",
              "name.givenName",
              "name.familyName"
            ]
          },
          "value": {}
        },
        "required": [
          "op",
          "value"
        ]
      }
    }
  },
  "required": [
    "schemas",
    "Operations"
  ]
}
```

**Responses:**

- **200**: SCIM User
- **409**: User already exists

### PUT /api/organizations/{name}/scim/v2/Users/{userId}

**Update SCIM user**

**Requires plan:** Enterprise Plus

Updates a provisioned user, you'll need to provide all their information fresh - just like setting them up for the first time. Any details you don't include will be automatically removed, so make sure to include everything they need to keep their account running smoothly. Setting `active` to `false` will deprovision the user from the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:User"
        ]
      ]
    },
    "userName": {
      "type": "string",
      "minLength": 2,
      "maxLength": 42,
      "pattern": "^\\b(?!\\d+$)(?![0-9a-fA-F]{24}$)([a-zA-Z0-9]|-(?!-))+\\b$",
      "description": "Username for the user, it should respect the hub rules: No consecutive dashes, No digit-only, Does not start or end with a dash, Only dashes, letters or numbers, Not 24 chars hex string"
    },
    "emails": {
      "maxItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "format": "email",
            "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
          }
        },
        "required": [
          "value"
        ]
      }
    },
    "name": {
      "type": "object",
      "properties": {
        "givenName": {
          "type": "string",
          "minLength": 1
        },
        "familyName": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "givenName",
        "familyName"
      ]
    },
    "active": {
      "default": true,
      "type": "boolean"
    },
    "externalId": {
      "type": "string"
    }
  },
  "required": [
    "schemas",
    "userName",
    "emails",
    "name",
    "externalId"
  ]
}
```

**Responses:**

- **200**: SCIM User
- **409**: User already exists

### DELETE /api/organizations/{name}/scim/v2/Users/{userId}

**Delete SCIM user**

**Requires plan:** Enterprise Plus

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Responses:**

- **204**: User deleted

### GET /api/organizations/{name}/scim/v2/Groups

**List SCIM groups**

**Requires plan:** Enterprise Plus

Get a list of SCIM groups. Retrieves a paginated list of all organization groups. If you provide the filter parameter, the resources for all matching groups are returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startIndex | query | number | No |  |
| count | query | number | No |  |
| filter | query | string | No |  |
| excludedAttributes | query | string | No |  |

**Responses:**

- **200**: SCIM Group List

### POST /api/organizations/{name}/scim/v2/Groups

**Create SCIM group**

**Requires plan:** Enterprise Plus

Creates a new group in the organization. The group name must be unique within the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "displayName": {
      "type": "string"
    },
    "externalId": {
      "type": "string"
    },
    "members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24,
            "pattern": "^[0-9a-fA-F]{24}$"
          }
        },
        "required": [
          "value"
        ]
      },
      "description": "Array of SCIM user ids"
    }
  },
  "required": [
    "displayName",
    "members"
  ]
}
```

**Responses:**

- **201**: SCIM Group
- **409**: Group already exists

### GET /api/organizations/{name}/scim/v2/Groups/{groupId}

**Get SCIM group**

**Requires plan:** Enterprise Plus

Retrieves a group by its ID. If you provide the `excludedAttributes` parameter, the `members` attribute is not returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |
| excludedAttributes | query | string | No |  |

**Responses:**

- **200**: SCIM Group

### PUT /api/organizations/{name}/scim/v2/Groups/{groupId}

**Update SCIM group**

**Requires plan:** Enterprise Plus

Updates a group by its ID. The group name must be unique within the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:schemas:core:2.0:Group"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:Group"
        ]
      ]
    },
    "displayName": {
      "type": "string"
    },
    "externalId": {
      "type": "string"
    },
    "members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24,
            "pattern": "^[0-9a-fA-F]{24}$"
          }
        },
        "required": [
          "value"
        ]
      }
    }
  },
  "required": [
    "schemas",
    "displayName",
    "members"
  ]
}
```

**Responses:**

- **200**: SCIM Group

### PATCH /api/organizations/{name}/scim/v2/Groups/{groupId}

**Update SCIM group**

**Requires plan:** Enterprise Plus

Update attributes of a SCIM group. Updates individual attributes using Operations format. Just provide the changes you want to make using add, remove (only `members` is supported), or replace operations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:api:messages:2.0:PatchOp"
      },
      "examples": [
        [
          "urn:ietf:params:scim:api:messages:2.0:PatchOp"
        ]
      ]
    },
    "Operations": {
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "op": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "value": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "value"
                  ]
                }
              }
            },
            "required": [
              "op",
              "path"
            ]
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "value": {}
            },
            "required": [
              "op",
              "value"
            ]
          }
        ]
      }
    }
  },
  "required": [
    "schemas",
    "Operations"
  ]
}
```

**Responses:**

- **200**: SCIM Group

### DELETE /api/organizations/{name}/scim/v2/Groups/{groupId}

**Delete SCIM group**

**Requires plan:** Enterprise Plus

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Responses:**

- **204**: SCIM Group deleted

### GET /api/organizations/{name}/scim-provisioning/v2/Users

**List SCIM-managed users**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Retrieves a paginated list of organization members and pending invitations managed by SCIM for non-managed organizations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startIndex | query | number | No |  |
| count | query | number | No |  |
| filter | query | string | No | You can filter results using the equals operator (eq) to find items that match specific values like `id`, `userName`, `emails`, and `externalId`. For example, to find a user named Bob, use this search: `?filter=userName%20eq%20Bob` |

**Responses:**

- **200**: SCIM User List

### POST /api/organizations/{name}/scim-provisioning/v2/Users

**Create SCIM invitation**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Creates an invitation for a user to join the organization. The user must have an existing Hugging Face account.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:User"
        ]
      ]
    },
    "userName": {
      "type": "string",
      "description": "IdP username. Ignored: the user is matched by confirmed email"
    },
    "emails": {
      "minItems": 1,
      "maxItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "format": "email",
            "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
          }
        },
        "required": [
          "value"
        ]
      }
    },
    "active": {
      "default": true,
      "type": "boolean"
    },
    "externalId": {
      "type": "string",
      "description": "SSO unique identifier (SAML nameid or OIDC sub claim) - required for SSO login"
    }
  },
  "required": [
    "schemas",
    "userName",
    "emails",
    "externalId"
  ]
}
```

**Responses:**

- **201**: SCIM User

### GET /api/organizations/{name}/scim-provisioning/v2/Users/{userId}

**SCIM provisioning user**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Retrieves a SCIM user by their ID for non-managed organizations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Responses:**

- **200**: SCIM User

### PATCH /api/organizations/{name}/scim-provisioning/v2/Users/{userId}

**Update SCIM user**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Modify individual attributes for non-managed organizations. Only the `active` field can be modified. User profile fields are not editable via SCIM.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:api:messages:2.0:PatchOp"
      },
      "examples": [
        [
          "urn:ietf:params:scim:api:messages:2.0:PatchOp"
        ]
      ]
    },
    "Operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "op": {
            "description": "`remove` operation is not supported for non-managed organizations",
            "type": "string"
          },
          "path": {
            "type": "string",
            "enum": [
              "active",
              "externalId",
              "userName",
              "emails[type eq \"work\"].value",
              "name.givenName",
              "name.familyName"
            ]
          },
          "value": {}
        },
        "required": [
          "op",
          "value"
        ]
      }
    }
  },
  "required": [
    "schemas",
    "Operations"
  ]
}
```

**Responses:**

- **200**: SCIM User

### PUT /api/organizations/{name}/scim-provisioning/v2/Users/{userId}

**Update SCIM user**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Updates a provisioned user's invitation for non-managed organizations. User profile fields are not editable via SCIM for non-managed organizations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:User"
        ]
      ]
    },
    "active": {
      "default": true,
      "type": "boolean"
    },
    "externalId": {
      "type": "string"
    }
  },
  "required": [
    "schemas",
    "externalId"
  ]
}
```

**Responses:**

- **200**: SCIM User
- **409**: User already exists

### DELETE /api/organizations/{name}/scim-provisioning/v2/Users/{userId}

**Delete SCIM user**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Removes a user from the organization and deletes any pending invitations for non-managed organizations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| userId | path | string | Yes |  |

**Responses:**

- **204**: User removed from organization
- **404**: User not found or not provisioned

### GET /api/organizations/{name}/scim-provisioning/v2/Groups

**List SCIM groups**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Get a list of SCIM groups. Retrieves a paginated list of all organization groups. If you provide the filter parameter, the resources for all matching groups are returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| startIndex | query | number | No |  |
| count | query | number | No |  |
| filter | query | string | No |  |
| excludedAttributes | query | string | No |  |

**Responses:**

- **200**: SCIM Group List

### POST /api/organizations/{name}/scim-provisioning/v2/Groups

**Create SCIM group**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Creates a new group in the organization. The group name must be unique within the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "displayName": {
      "type": "string"
    },
    "externalId": {
      "type": "string"
    },
    "members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24,
            "pattern": "^[0-9a-fA-F]{24}$"
          }
        },
        "required": [
          "value"
        ]
      },
      "description": "Array of SCIM user ids"
    }
  },
  "required": [
    "displayName",
    "members"
  ]
}
```

**Responses:**

- **201**: SCIM Group
- **409**: Group already exists

### GET /api/organizations/{name}/scim-provisioning/v2/Groups/{groupId}

**Get SCIM group**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Retrieves a group by its ID. If you provide the `excludedAttributes` parameter, the `members` attribute is not returned.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |
| excludedAttributes | query | string | No |  |

**Responses:**

- **200**: SCIM Group

### PUT /api/organizations/{name}/scim-provisioning/v2/Groups/{groupId}

**Update SCIM group**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Updates a group by its ID. The group name must be unique within the organization.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:schemas:core:2.0:Group"
      },
      "examples": [
        [
          "urn:ietf:params:scim:schemas:core:2.0:Group"
        ]
      ]
    },
    "displayName": {
      "type": "string"
    },
    "externalId": {
      "type": "string"
    },
    "members": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string",
            "minLength": 24,
            "maxLength": 24,
            "pattern": "^[0-9a-fA-F]{24}$"
          }
        },
        "required": [
          "value"
        ]
      }
    }
  },
  "required": [
    "schemas",
    "displayName",
    "members"
  ]
}
```

**Responses:**

- **200**: SCIM Group

### PATCH /api/organizations/{name}/scim-provisioning/v2/Groups/{groupId}

**Update SCIM group**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

Update attributes of a SCIM group. Updates individual attributes using Operations format. Just provide the changes you want to make using add, remove (only `members` is supported), or replace operations.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Request Body:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "schemas": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "string",
        "const": "urn:ietf:params:scim:api:messages:2.0:PatchOp"
      },
      "examples": [
        [
          "urn:ietf:params:scim:api:messages:2.0:PatchOp"
        ]
      ]
    },
    "Operations": {
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "op": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "value": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "value"
                  ]
                }
              }
            },
            "required": [
              "op",
              "path"
            ]
          },
          {
            "type": "object",
            "properties": {
              "op": {
                "type": "string"
              },
              "path": {
                "type": "string"
              },
              "value": {}
            },
            "required": [
              "op",
              "value"
            ]
          }
        ]
      }
    }
  },
  "required": [
    "schemas",
    "Operations"
  ]
}
```

**Responses:**

- **200**: SCIM Group

### DELETE /api/organizations/{name}/scim-provisioning/v2/Groups/{groupId}

**Delete SCIM group**

**Requires plan:** Enterprise, Enterprise Plus, Academia Hub

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|------|----------|-------------|
| name | path | string | Yes |  |
| groupId | path | string | Yes |  |

**Responses:**

- **204**: SCIM Group deleted

## Agents

The following endpoints provide information about AI agents using the Hub.

### GET /api/agent-harnesses

**Get agent harnesses**

Get the registry of AI agents / harnesses known to the Hub, along with the standard environment variables used to detect them. Clients use this registry to identify which agent they are running in when reporting Hub activity.

**Responses:**

- **200**: The registry of AI agents / harnesses known to the Hub