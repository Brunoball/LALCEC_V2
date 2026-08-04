<?php
declare(strict_types=1);

require_once __DIR__ . '/configuracion.php';

function register_configuracion_routes(Router $router): void
{
    $router->register('configuracion_obtener', 'GET', [Configuracion::class, 'obtener'], true);
    $router->register('configuracion_guardar_parametros', 'POST', [Configuracion::class, 'guardarParametros'], true);
    $router->register('configuracion_lista_guardar', 'POST', [Configuracion::class, 'guardarItem'], true);
    $router->register('configuracion_lista_eliminar', 'POST', [Configuracion::class, 'eliminarItem'], true);
    $router->register('configuracion_lista_reactivar', 'POST', [Configuracion::class, 'reactivarItem'], true);
}
