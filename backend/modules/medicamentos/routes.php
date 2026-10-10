<?php
declare(strict_types=1);
require_once __DIR__ . '/medicamentos.php';
function register_medicamentos_routes(Router $router): void {
    foreach (['catalogo'=>'catalogo','lotes'=>'lotes','historial'=>'historial','prestamos'=>'prestamos','prestamo_detalle'=>'prestamoDetalle','socios'=>'socios','procedencias'=>'procedencias','medios'=>'medios'] as $accion=>$metodo) {
        $router->register('medicamentos_'.$accion, 'GET', [Medicamentos::class,$metodo]);
    }
    foreach (['guardar'=>'guardar','cambiar_estado'=>'cambiarEstado','ingresar'=>'ingresar','salida'=>'salida','anular'=>'anular','revisar_lote'=>'revisarLote','prestar'=>'prestar','devolver'=>'devolver','sena'=>'sena','cerrar'=>'cerrar'] as $accion=>$metodo) {
        $router->register('medicamentos_'.$accion, 'POST', [Medicamentos::class,$metodo]);
    }
}
