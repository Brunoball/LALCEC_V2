<?php
declare(strict_types=1);

require_once __DIR__ . '/../contable/contable_schema.php';
require_once __DIR__ . '/configuracion_soporte.php';
require_once __DIR__ . '/configuracion_consultas.php';
require_once __DIR__ . '/configuracion_gestion.php';

final class Configuracion
{
    use ConfiguracionConsultas;
    use ConfiguracionGestion;

    public static function obtener(): never
    {
        $auth = auth_context();
        ensure_contable_schema($auth['db']);
        api_success(self::obtenerDatos($auth['db']));
    }

    public static function guardarParametros(): never
    {
        $auth = require_admin();
        ensure_contable_schema($auth['db']);
        $result = self::guardarParametrosDatos($auth, request_body());
        api_success($result, 'El monto de inscripción se actualizó correctamente.');
    }

    public static function guardarItem(): never
    {
        $auth = require_admin();
        ensure_contable_schema($auth['db']);
        $result = self::guardarItemDatos($auth, request_body());
        api_success($result, $result['creado']
            ? 'La opción se agregó correctamente.'
            : 'La opción se modificó correctamente.');
    }

    public static function eliminarItem(): never
    {
        $auth = require_admin();
        ensure_contable_schema($auth['db']);
        $result = self::cambiarEstadoItemDatos($auth, request_body(), false);
        $message = !empty($result['eliminado_definitivo'])
            ? 'La opción se eliminó definitivamente.'
            : 'La opción se desactivó porque posee registros asociados.';
        api_success($result, $message);
    }

    public static function reactivarItem(): never
    {
        $auth = require_admin();
        ensure_contable_schema($auth['db']);
        $result = self::cambiarEstadoItemDatos($auth, request_body(), true);
        api_success($result, 'La opción se reactivó correctamente.');
    }
}
