<?php
declare(strict_types=1);

/**
 * Verifica, sin modificar la base, que la migración del módulo Contable haya
 * sido aplicada. La creación y actualización de tablas debe hacerse únicamente
 * mediante SQL/migraciones, nunca durante una petición de la aplicación.
 */
function ensure_contable_schema(PDO $db): void
{
    static $validatedConnections = [];
    $connectionId = spl_object_id($db);
    if (isset($validatedConnections[$connectionId])) return;

    $requiredTables = [
        'contable_opciones',
        'contable_ingresos',
        'contable_egresos',
    ];

    try {
        $placeholders = implode(', ', array_fill(0, count($requiredTables), '?'));
        $statement = $db->prepare(
            "SELECT TABLE_NAME
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ({$placeholders})"
        );
        $statement->execute($requiredTables);
        $existingTables = array_fill_keys($statement->fetchAll(PDO::FETCH_COLUMN), true);
        $missingTables = array_values(array_filter(
            $requiredTables,
            static fn(string $table): bool => !isset($existingTables[$table])
        ));
    } catch (Throwable $error) {
        throw new RuntimeException(
            'No se pudo validar la estructura del módulo Contable. Detalle: ' . $error->getMessage(),
            0,
            $error
        );
    }

    if ($missingTables !== []) {
        throw new RuntimeException(
            'Faltan tablas del módulo Contable: ' . implode(', ', $missingTables)
            . '. Aplicá la migración SQL correspondiente antes de usar el módulo.'
        );
    }

    $statement = $db->query(
        "SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'contable_ingresos'
           AND COLUMN_NAME IN ('origen_modulo', 'id_referencia_origen')"
    );
    $originColumns = $statement->fetchAll(PDO::FETCH_COLUMN);
    if (count($originColumns) !== 2) {
        throw new RuntimeException(
            'Falta aplicar la migración de Ventas que integra sus ingresos con el módulo Contable.'
        );
    }

    $validatedConnections[$connectionId] = true;
}
