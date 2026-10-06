import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseExpressRoutes } from './expressParser';
import { parseNestJsRoutes } from './nestjsParser';
import { scanWorkspaceForEndpoints } from './scanner';
import { generateCurlCommand } from './curlGenerator';

describe('Express: client calls are not routes', () => {
  it('ignores axios / axios.create() / got calls', () => {
    const text = [
      "const api = axios.create({ baseURL: 'x' });",
      "axios.get('/api/remote');",
      "api.get('/api/also-remote');",
      "app.get('/api/real', handler);"
    ].join('\n');

    expect(parseExpressRoutes(text, 'a.ts').map((e) => e.path)).toEqual(['/api/real']);
  });
});

describe('Express: router.route() chains', () => {
  it('detects each verb chained on route()', () => {
    const text = "router.route('/items')\n  .get(list)\n  .post(create);\n";

    const endpoints = parseExpressRoutes(text, 'a.ts');

    expect(endpoints.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /items', 'POST /items']);
  });
});

describe('Express: mount prefixes', () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-companion-mounts-'));
  }

  it('applies a same-file app.use(prefix, router) mount to that router only', () => {
    const root = tmp();
    fs.writeFileSync(
      path.join(root, 'app.js'),
      "const router = express.Router();\nrouter.get('/users', h);\napp.get('/health', h);\napp.use('/api', router);\n"
    );

    const paths = scanWorkspaceForEndpoints(root).endpoints.map((e) => e.path).sort();

    expect(paths).toEqual(['/api/users', '/health']);
  });

  it('follows a mount across files via require/import', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, 'routes'));
    fs.writeFileSync(path.join(root, 'routes', 'users.js'), "router.get('/', h);\nrouter.get('/:id', h);\n");
    fs.writeFileSync(
      path.join(root, 'app.js'),
      "const users = require('./routes/users');\napp.use('/api/users', users);\n"
    );

    const paths = scanWorkspaceForEndpoints(root).endpoints.map((e) => e.path).sort();

    expect(paths).toEqual(['/api/users', '/api/users/:id']);
  });
});

describe('NestJS: alternative decorator forms', () => {
  it('supports @Controller({ path }) and @Get([...]) arrays', () => {
    const text = [
      "@Controller({ path: 'cats', version: '1' })",
      'export class CatsController {',
      "  @Get(['a', 'b'])",
      '  find() {}',
      '}'
    ].join('\n');

    expect(parseNestJsRoutes(text, 'c.ts').map((e) => e.path)).toEqual(['/cats/a', '/cats/b']);
  });
});

describe('cURL quoting', () => {
  const endpoint = {
    method: 'POST' as const,
    path: "/it's",
    filePath: 'a.ts',
    line: 1,
    framework: 'express' as const,
    bodyFields: [{ name: 'name' }]
  };

  it('escapes single quotes for posix shells', () => {
    expect(generateCurlCommand(endpoint)).toContain(`'http://localhost:3000/it'\\''s'`);
  });

  it('uses curl.exe with double quotes for windows', () => {
    const curl = generateCurlCommand(endpoint, { style: 'windows' });

    expect(curl.startsWith('curl.exe -X POST "http://localhost:3000/it\'s"')).toBe(true);
    expect(curl).toContain('-d "{\\"name\\":\\"\\"}"');
  });
});
