<?php
declare(strict_types=1);

require_once __DIR__ . '/ventas_schema.php';
require_once __DIR__ . '/ventas_soporte.php';
require_once __DIR__ . '/ventas_consultas.php';
require_once __DIR__ . '/ventas_gestion.php';

final class Ventas
{
    use VentasSoporte;
    use VentasConsultas;
    use VentasGestion;

    public static function catalogos(): never
    {
        $auth = auth_context();
        ensure_ventas_schema($auth['db']);
        api_success(self::catalogosVentas($auth['db']));
    }

    public static function listar(): never
    {
        $auth = auth_context();
        ensure_ventas_schema($auth['db']);
        api_success(self::listarVentas($auth['db'], $_GET));
    }

    public static function buscarSocios(): never
    {
        $auth = auth_context();
        ensure_ventas_schema($auth['db']);
        api_success(['items' => self::buscarSociosVenta($auth['db'], $_GET['buscar'] ?? '')]);
    }

    public static function guardarConfiguracion(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::guardarConfiguracionVenta($auth, request_body()), 'La configuración de venta se guardó correctamente.');
    }

    public static function estadoConfiguracion(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::cambiarEstadoConfiguracionVenta($auth, request_body()), 'El estado de la configuración se actualizó.');
    }

    public static function eliminarConfiguracion(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(
            self::eliminarConfiguracionVenta($auth, request_body()),
            'La configuración de venta se eliminó correctamente.'
        );
    }

    public static function guardarProducto(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::guardarProductoVenta($auth, request_body()), 'El producto se guardó correctamente.');
    }

    public static function estadoProducto(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::cambiarEstadoProductoVenta($auth, request_body()), 'El estado del producto se actualizó.');
    }

    public static function guardarVenta(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::guardarVentaDatos($auth, request_body()), 'La venta se guardó correctamente.');
    }

    public static function estadoVenta(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::cambiarEstadoVenta($auth, request_body()), 'El estado de la venta se actualizó.');
    }

    public static function eliminarVenta(): never
    {
        $auth = require_admin();
        ensure_ventas_schema($auth['db']);
        api_success(self::eliminarVentaDatos($auth, request_body()), 'La venta se eliminó correctamente.');
    }
}
