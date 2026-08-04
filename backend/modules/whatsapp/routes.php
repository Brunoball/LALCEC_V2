<?php
declare(strict_types=1);

function register_whatsapp_routes(Router $router): void
{
    $router->register('whatsapp_estado', 'GET', static fn() => not_implemented('Whatsapp'), true);
    $router->register('whatsapp_configuracion_guardar', 'POST', static fn() => not_implemented('Whatsapp'), true);
    $router->register('whatsapp_plantillas_listar', 'GET', static fn() => not_implemented('Whatsapp'), true);
    $router->register('whatsapp_mensaje_enviar', 'POST', static fn() => not_implemented('Whatsapp'), true);
}
