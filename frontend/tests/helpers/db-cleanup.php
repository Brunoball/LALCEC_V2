<?php
declare(strict_types=1);

function fail(string $message, int $code = 1): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit($code);
}

function parse_env_file(string $path): array {
    if (!is_file($path)) fail("No se encontró el .env del backend: {$path}");
    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && (($value[0] === '"' && $value[-1] === '"') || ($value[0] === "'" && $value[-1] === "'"))) {
            $value = substr($value, 1, -1);
        }
        $values[$key] = $value;
    }
    return $values;
}

$operation = $argv[1] ?? '';
$value = $argv[2] ?? '';
$allowed = ['family-prefix', 'user-prefix', 'login-prefix'];
if (!in_array($operation, $allowed, true)) fail('Operación de limpieza no válida.');

if ($operation === 'family-prefix' && !str_starts_with($value, 'PW E2E FAM ')) {
    fail('Prefijo de familias inválido.');
}
if (in_array($operation, ['user-prefix', 'login-prefix'], true) && !str_starts_with($value, 'pw_e2e_')) {
    fail('Prefijo de usuarios inválido.');
}

$backendDir = getenv('PW_BACKEND_DIR') ?: realpath(__DIR__ . '/../../../backend');
if (!$backendDir || !is_dir($backendDir)) fail('No se pudo localizar la carpeta backend.');
$env = parse_env_file($backendDir . DIRECTORY_SEPARATOR . '.env');

$appEnv = strtolower((string)($env['APP_ENV'] ?? ''));
$allow = strtolower((string)(getenv('PW_ALLOW_DB_CLEANUP') ?: 'false'));
if ($appEnv !== 'local' && !in_array($allow, ['1', 'true', 'yes', 'si'], true)) {
    fail('Limpieza directa bloqueada: APP_ENV no es local.');
}

$host = $env['DB_HOST'] ?? 'localhost';
$port = (int)($env['DB_PORT'] ?? 3306);
$name = $env['DB_NAME'] ?? '';
$user = $env['DB_USER'] ?? '';
$pass = $env['DB_PASS'] ?? '';
if ($name === '') fail('DB_NAME no está configurado.');

$pdo = new PDO(
    "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
    $user,
    $pass,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

$pdo->beginTransaction();
try {
    if ($operation === 'family-prefix') {
        $find = $pdo->prepare('SELECT id_familia FROM familias WHERE nombre LIKE ? FOR UPDATE');
        $find->execute([$value . '%']);
        $ids = array_map('intval', array_column($find->fetchAll(), 'id_familia'));
        if ($ids !== []) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $pdo->prepare("DELETE FROM familias_socios WHERE id_familia IN ({$placeholders})")->execute($ids);
            $pdo->prepare("DELETE FROM familias WHERE id_familia IN ({$placeholders})")->execute($ids);
        }
        $pdo->commit();
        echo 'Familias eliminadas: ' . count($ids) . PHP_EOL;
        exit(0);
    }

    if ($operation === 'login-prefix') {
        $delete = $pdo->prepare('DELETE FROM sis_login_auditoria WHERE usuario LIKE ?');
        $delete->execute([$value . '%']);
        $count = $delete->rowCount();
        $pdo->commit();
        echo 'Auditorías eliminadas: ' . $count . PHP_EOL;
        exit(0);
    }

    $find = $pdo->prepare('SELECT idUsuario FROM sis_usuarios WHERE usuario LIKE ? FOR UPDATE');
    $find->execute([$value . '%']);
    $ids = array_map('intval', array_column($find->fetchAll(), 'idUsuario'));
    if ($ids !== []) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM sis_sesiones WHERE idUsuario IN ({$placeholders})")->execute($ids);
        $pdo->prepare("DELETE FROM sis_login_auditoria WHERE idUsuario IN ({$placeholders})")->execute($ids);
        $pdo->prepare("DELETE FROM sis_usuarios WHERE idUsuario IN ({$placeholders})")->execute($ids);
    }
    // También se limpian intentos de usuarios inexistentes que compartan el prefijo.
    $pdo->prepare('DELETE FROM sis_login_auditoria WHERE usuario LIKE ?')->execute([$value . '%']);
    $pdo->commit();
    echo 'Usuarios eliminados: ' . count($ids) . PHP_EOL;
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail($error->getMessage());
}
