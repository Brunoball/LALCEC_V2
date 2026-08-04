<?php
declare(strict_types=1);

require_once __DIR__ . '/ventas.php';

function register_ventas_routes(Router $router): void
{
    $router->register('ventas_catalogos', 'GET', [Ventas::class, 'catalogos'], true);
    $router->register('ventas_listar', 'GET', [Ventas::class, 'listar'], true);
    $router->register('ventas_socios_buscar', 'GET', [Ventas::class, 'buscarSocios'], true);
    $router->register('ventas_configuracion_guardar', 'POST', [Ventas::class, 'guardarConfiguracion'], true);
    $router->register('ventas_configuracion_estado', 'POST', [Ventas::class, 'estadoConfiguracion'], true);
    $router->register('ventas_configuracion_eliminar', 'POST', [Ventas::class, 'eliminarConfiguracion'], true);
    $router->register('ventas_producto_guardar', 'POST', [Ventas::class, 'guardarProducto'], true);
    $router->register('ventas_producto_estado', 'POST', [Ventas::class, 'estadoProducto'], true);
    $router->register('ventas_venta_guardar', 'POST', [Ventas::class, 'guardarVenta'], true);
    $router->register('ventas_venta_estado', 'POST', [Ventas::class, 'estadoVenta'], true);
    $router->register('ventas_venta_eliminar', 'POST', [Ventas::class, 'eliminarVenta'], true);
}

