<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function pdo_connection_error_is_transient(PDOException $error): bool
{
    $driverCode = isset($error->errorInfo[1]) ? (int)$error->errorInfo[1] : 0;
    if (in_array($driverCode, [1040, 1203, 2002, 2006, 2013], true)) {
        return true;
    }

    $message = strtolower($error->getMessage());
    foreach ([
        'operation not permitted',
        'connection refused',
        'too many connections',
        "can't connect",
        'cannot connect',
        'connection timed out',
        'resource temporarily unavailable',
        'server has gone away',
        'lost connection',
    ] as $token) {
        if (str_contains($message, $token)) return true;
    }

    return false;
}

function pdo_connection(string $host, int $port, string $database, string $user, string $password): PDO
{
    if ($database === '') {
        throw new RuntimeException('La variable DB_NAME no puede estar vacía.');
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4";
    $retryDelaysUs = [150000, 400000];
    $lastError = null;

    for ($attempt = 0; $attempt <= count($retryDelaysUs); $attempt++) {
        try {
            return new PDO($dsn, $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $error) {
            $lastError = $error;
            if (!pdo_connection_error_is_transient($error) || $attempt >= count($retryDelaysUs)) {
                throw $error;
            }
            usleep($retryDelaysUs[$attempt]);
        }
    }

    throw $lastError ?? new RuntimeException('No se pudo abrir la conexión a la base de datos.');
}

/**
 * Única conexión de la aplicación.
 *
 * El proyecto dejó de resolver organizaciones mediante una base maestra: autenticación,
 * sesiones, auditoría y módulos funcionales trabajan sobre la misma base.
 */
function app_db(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) return $connection;

    $connection = pdo_connection(
        (string)env_value('DB_HOST', 'localhost'),
        (int)env_value('DB_PORT', '3306'),
        (string)env_value('DB_NAME', 'lalcec_v2'),
        (string)env_value('DB_USER', 'root'),
        (string)env_value('DB_PASS', '')
    );

    return $connection;
}
