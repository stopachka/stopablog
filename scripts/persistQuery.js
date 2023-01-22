const https = require('https');
const GraphQLLanguage = require('graphql/language');
const {parse, print} = require('graphql');
const fs = require('fs');
const prettier = require('prettier');

require('dotenv').config();

if (
  (!process.env.REPOSITORY_FIXED_VARIABLES &&
    // Backwards compat with older apps that started with razzle
    process.env.RAZZLE_GITHUB_REPO_OWNER &&
    process.env.RAZZLE_GITHUB_REPO_NAME) ||
  (process.env.NEXT_PUBLIC_GITHUB_REPO_OWNER &&
    process.env.NEXT_PUBLIC_GITHUB_REPO_NAME) ||
  (process.env.VERCEL_GITHUB_ORG && process.env.VERCEL_GITHUB_REPO)
) {
  const repoName =
    process.env['RAZZLE_GITHUB_REPO_NAME'] ||
    process.env['NEXT_PUBLIC_GITHUB_REPO_NAME'] ||
    process.env['VERCEL_GITHUB_REPO'];
  const repoOwner =
    process.env['RAZZLE_GITHUB_REPO_OWNER'] ||
    process.env['NEXT_PUBLIC_GITHUB_REPO_OWNER'] ||
    process.env['VERCEL_GITHUB_ORG'];
  process.env[
    'REPOSITORY_FIXED_VARIABLES'
  ] = `{"repoName": "${repoName}", "repoOwner": "${repoOwner}"}`;
}

const PERSIST_QUERY_MUTATION = `
  mutation PersistQuery(
    $freeVariables: [String!]!
    $appId: String!
    $accessToken: String
    $query: String!
    $fixedVariables: JSON
    $cacheStrategy: OneGraphPersistedQueryCacheStrategyArg
    $fallbackOnError: Boolean!
  ) {
    oneGraph {
      createPersistedQuery(
        input: {
          query: $query
          accessToken: $accessToken
          appId: $appId
          cacheStrategy: $cacheStrategy
          freeVariables: $freeVariables
          fixedVariables: $fixedVariables
          fallbackOnError: $fallbackOnError
        }
      ) {
        persistedQuery {
          id
        }
      }
    }
  }
`;

async function persistQuery(queryText) {
  const ast = parse(queryText, {noLocation: true});

  const freeVariables = new Set([]);
  let accessToken = null;
  let fixedVariables = null;
  let cacheSeconds = null;
  let operationName = null;
  let transformedAst = GraphQLLanguage.visit(ast, {
    OperationDefinition: {
      enter(node) {
        operationName = node.name.value;
        operationType = node.operation;
        for (const directive of node.directives) {
          if (directive.name.value === 'persistedQueryConfiguration') {
            const accessTokenArg = directive.arguments.find(
              (a) => a.name.value === 'accessToken',
            );
            const fixedVariablesArg = directive.arguments.find(
              (a) => a.name.value === 'fixedVariables',
            );
            const freeVariablesArg = directive.arguments.find(
              (a) => a.name.value === 'freeVariables',
            );

            const cacheSecondsArg = directive.arguments.find(
              (a) => a.name.value === 'cacheSeconds',
            );

            if (accessTokenArg) {
              const envArg = accessTokenArg.value.fields.find(
                (f) => f.name.value === 'environmentVariable',
              );
              if (envArg) {
                if (accessToken) {
                  throw new Error(
                    'Access token is already defined for operation=' +
                      node.name.value,
                  );
                }
                const envVar = envArg.value.value;
                accessToken = process.env[envVar];
                if (!accessToken) {
                  throw new Error(
                    'Cannot persist query. Missing environment variable `' +
                      envVar +
                      '`.',
                  );
                }
              }
            }

            if (fixedVariablesArg) {
              const envArg = fixedVariablesArg.value.fields.find(
                (f) => f.name.value === 'environmentVariable',
              );
              if (envArg) {
                if (fixedVariables) {
                  throw new Error(
                    'fixedVariables are already defined for operation=' +
                      node.name.value,
                  );
                }
                const envVar = envArg.value.value;
                fixedVariables = JSON.parse(process.env[envVar]);
                if (!fixedVariables) {
                  throw new Error(
                    'Cannot persist query. Missing environment variable `' +
                      envVar +
                      '`.',
                  );
                }
              }
            }

            if (freeVariablesArg) {
              for (const v of freeVariablesArg.value.values) {
                freeVariables.add(v.value);
              }
            }

            if (cacheSecondsArg) {
              cacheSeconds = parseFloat(cacheSecondsArg.value.value);
            }
          }
        }
        return {
          ...node,
          directives: node.directives.filter(
            (d) => d.name.value !== 'persistedQueryConfiguration',
          ),
        };
      },
    },
  });

  const apiHandler =
    operationType === 'query'
      ? `
    import fetch from 'node-fetch';
    const query = \`${print(transformedAst)}\`;
    const token = process.env.GITHUB_TOKEN;
    const variables = ${JSON.stringify(fixedVariables || {}, null, 2)};
    const freeVariables = new Set(${JSON.stringify([...freeVariables])});
    const ${operationName} = async (req, res) => {
      if (freeVariables.size > 0 && req.query.variables) {
        const requestVariables = JSON.parse(req.query.variables);
        for (const v of freeVariables) {
          variables[v] = requestVariables[v]
        }
      }

      const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: \`Bearer \${token}\`,
          'User-Agent': 'oneblog',
        },
        body: JSON.stringify({query, variables})
      });
      const json = await resp.json();
      res.setHeader('Content-Type', 'application/json');
      if (${cacheSeconds}) {
        res.setHeader(
          'Cache-Control',
          'public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}'
        );
      }
      res.status(200).send(json);
    }
    export default ${operationName};`
      : `
    const ${operationName} = async (req, res) => {
      const json = {"errors": [{"message": "Mutations are not yet supported"}]};
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(json);
    }
    export default ${operationName};
`;

  fs.mkdirSync('./src/pages/api/__generated__/', {recursive: true});

  fs.writeFileSync(
    `./src/pages/api/__generated__/${operationName}.js`,
    prettier.format(apiHandler),
  );

  return operationName;
}

exports.default = persistQuery;
