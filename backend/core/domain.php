<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

function client_ip(): string
{
    return substr(trim((string)($_SERVER['REMOTE_ADDR'] ?? '')), 0, 64);
}

function client_user_agent(): string
{
    return substr(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 255);
}

function clean_text(mixed $value, int $maxLength = 255, bool $uppercase = true): string
{
    $text = preg_replace('/\s+/u', ' ', trim((string)$value)) ?? '';
    if ($uppercase) $text = function_exists('mb_strtoupper') ? mb_strtoupper($text, 'UTF-8') : strtoupper($text);
    return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength, 'UTF-8') : substr($text, 0, $maxLength);
}

function optional_text(mixed $value, int $maxLength = 255, bool $uppercase = true): ?string
{
    $text = clean_text($value, $maxLength, $uppercase);
    return $text === '' ? null : $text;
}

function required_text(array $body, string $field, string $label, int $maxLength = 255, bool $uppercase = true): string
{
    $text = clean_text($body[$field] ?? '', $maxLength, $uppercase);
    if ($text === '') api_error("El campo {$label} es obligatorio.", 'VALIDATION_ERROR', 422, ['campo' => $field]);
    return $text;
}

function positive_id(mixed $value, string $label = 'registro'): int
{
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) api_error("El identificador de {$label} no es válido.", 'VALIDATION_ERROR');
    return (int)$id;
}

function id_list(mixed $value): array
{
    if (!is_array($value)) return [];
    $ids = [];
    foreach ($value as $item) {
        $candidate = is_array($item) ? ($item['id'] ?? $item['id_categoria'] ?? $item['id_modalidad_pago'] ?? null) : $item;
        $id = filter_var($candidate, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id !== false) $ids[(int)$id] = (int)$id;
    }
    return array_values($ids);
}

function valid_date(mixed $value, string $label, bool $required = true): ?string
{
    $text = trim((string)$value);
    if ($text === '' && !$required) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $text);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $text) {
        api_error("La fecha de {$label} no es válida.", 'VALIDATION_ERROR');
    }
    return $text;
}

function decimal_amount(mixed $value, string $label, float $min = 0, float $max = 9999999999.99): string
{
    if ($value === '' || $value === null || !is_numeric($value)) api_error("El campo {$label} debe ser un importe válido.", 'VALIDATION_ERROR');
    $number = (float)$value;
    if ($number < $min || $number > $max) api_error("El campo {$label} está fuera del rango permitido.", 'VALIDATION_ERROR');
    return number_format($number, 2, '.', '');
}

function transaction(PDO $db, callable $callback): mixed
{
    $db->beginTransaction();
    try {
        $result = $callback();
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function audit_change(PDO $db, array $auth, string $module, string $action, string $table, int|string|null $id, string $description, mixed $before, mixed $after): void
{
    $statement = $db->prepare(
        'INSERT INTO auditoria
         (id_usuario_master, modulo, accion, tabla_afectada, id_registro, descripcion, datos_anteriores, datos_nuevos, ip, user_agent)
         VALUES (:usuario, :modulo, :accion, :tabla, :registro, :descripcion, :antes, :despues, :ip, :agente)'
    );
    $encode = static function (mixed $data): ?string {
        if ($data === null) return null;

        // La auditoría nunca debe tirar abajo la operación principal por un
        // texto histórico con bytes UTF-8 inválidos, NAN/INF u otro valor no
        // serializable de forma estricta. JSON_PARTIAL_OUTPUT_ON_ERROR conserva
        // el resto del contenido y JSON_INVALID_UTF8_SUBSTITUTE reemplaza solo
        // los bytes dañados.
        $json = json_encode(
            $data,
            JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES
                | JSON_INVALID_UTF8_SUBSTITUTE
                | JSON_PARTIAL_OUTPUT_ON_ERROR
                | JSON_PRESERVE_ZERO_FRACTION
        );

        return is_string($json)
            ? $json
            : '{"error":"No se pudo serializar el detalle de auditoría."}';
    };
    $statement->execute([
        'usuario' => $auth['id_usuario_master'],
        'modulo' => $module,
        'accion' => $action,
        'tabla' => $table,
        'registro' => $id === null ? null : (string)$id,
        'descripcion' => $description,
        'antes' => $encode($before),
        'despues' => $encode($after),
        'ip' => client_ip(),
        'agente' => client_user_agent(),
    ]);
}

function duplicate_key(Throwable $error): bool
{
    return $error instanceof PDOException && (string)$error->getCode() === '23000';
}
