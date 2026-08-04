<?php
declare(strict_types=1);

require_once __DIR__ . '/cuotas.php';

function register_cuotas_routes(Router $router): void
{
    $router->register('cuotas_listar', 'GET', [Cuotas::class, 'listar'], true);
    $router->register('cuotas_catalogos', 'GET', [Cuotas::class, 'catalogos'], true);
    $router->register('cuotas_detalle_socio', 'GET', [Cuotas::class, 'detalleSocio'], true);
    $router->register('cuotas_registrar_cobro', 'POST', [Cuotas::class, 'registrarCobro'], true);
    $router->register('cuotas_registrar_pago', 'POST', [Cuotas::class, 'registrarPago'], true);
    $router->register('cuotas_registrar_inscripcion', 'POST', [Cuotas::class, 'registrarInscripcion'], true);
    $router->register('cuotas_anular', 'POST', [Cuotas::class, 'anular'], true);
    $router->register('cuotas_comprobante', 'GET', [Cuotas::class, 'comprobante'], true);
}
