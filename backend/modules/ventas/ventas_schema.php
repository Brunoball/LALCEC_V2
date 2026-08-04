<?php
declare(strict_types=1);

function ensure_ventas_schema(PDO $db): void
{
    static $checked = [];
    $key = spl_object_id($db);
    if (isset($checked[$key])) return;

    $requiredTables = [
        'ventas_configuraciones',
        'ventas_productos',
        'ventas_operaciones',
        'ventas_items',
        'ventas_stock_movimientos',
        'contable_ingresos',
    ];
    $placeholders = implode(',', array_fill(0, count($requiredTables), '?'));
    $statement = $db->prepare(
        "SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ({$placeholders})"
    );
    $statement->execute($requiredTables);
    $existing = array_column($statement->fetchAll(), 'TABLE_NAME');
    $missing = array_values(array_diff($requiredTables, $existing));
    if ($missing !== []) {
        api_error(
            'El módulo Ventas todavía no fue instalado en la base de esta organización.',
            'VENTAS_SCHEMA_MISSING',
            503,
            ['tablas_faltantes' => $missing]
        );
    }

    $statement = $db->prepare(
        "SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'contable_ingresos'
           AND COLUMN_NAME IN ('origen_modulo', 'id_referencia_origen')"
    );
    $statement->execute();
    $columns = array_column($statement->fetchAll(), 'COLUMN_NAME');
    if (count($columns) !== 2) {
        api_error(
            'Falta completar la integración entre Ventas y Contable.',
            'VENTAS_CONTABLE_SCHEMA_MISSING',
            503
        );
    }

    $checked[$key] = true;
}

