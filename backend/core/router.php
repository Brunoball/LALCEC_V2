<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/request.php';
require_once __DIR__ . '/e2e_guard.php';

final class Router
{
    private array $routes = [];

    public function register(string $action, string $method, callable $handler, bool $protected = true): void
    {
        $this->routes[$action] = ['method' => strtoupper($method), 'handler' => $handler, 'protected' => $protected];
    }

    public function dispatch(string $action): never
    {
        if ($action === '' || !isset($this->routes[$action])) {
            json_response(['exito' => false, 'mensaje' => $action === '' ? 'Falta el parámetro action.' : 'Acción no encontrada.'], $action === '' ? 400 : 404);
        }
        $route = $this->routes[$action];
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method !== $route['method']) json_response(['exito' => false, 'mensaje' => 'Método HTTP no permitido.'], 405);
        $auth = null;
        if ($route['protected']) {
            $auth = require_auth();
            if ($method !== 'GET' && ($auth['auth_source'] ?? '') === 'cookie') {
                api_error(
                    'Por seguridad, actualizá la página e iniciá sesión nuevamente antes de modificar información.',
                    'CSRF_PROTECTION',
                    403
                );
            }
        }

        // Cuando Playwright apunta a producción, el header E2E activa un
        // escudo adicional que impide que cualquier POST funcional alcance
        // registros que no hayan sido creados por la propia suite.
        if ($method !== 'GET' && e2e_request_enabled()) {
            e2e_guard_mutation($action, $auth);
        }

        ($route['handler'])();
        json_response(['exito' => true]);
    }
}
