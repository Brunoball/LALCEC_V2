<?php
declare(strict_types=1);
require_once __DIR__ . '/medicamentos.php';
require_once __DIR__ . '/medicamentos_opciones.php';
function register_medicamentos_routes(Router $router): void {
    $router->register('medicamentos_opciones', 'GET', [MedicamentosOpciones::class,'listar']);
    $router->register('medicamentos_opcion_guardar', 'POST', [MedicamentosOpciones::class,'guardar']);
    $router->register('medicamentos_opcion_estado', 'POST', [MedicamentosOpciones::class,'cambiarEstado']);
    $router->register('medicamentos_opcion_eliminar', 'POST', [MedicamentosOpciones::class,'eliminar']);
    foreach (['alertas'=>'alertas','catalogo'=>'catalogo','historial'=>'historial','prestamos'=>'prestamos','prestamo_detalle'=>'prestamoDetalle','socios'=>'socios','procedencias'=>'procedencias','medios'=>'medios'] as $accion=>$metodo) {
        $router->register('medicamentos_'.$accion, 'GET', [Medicamentos::class,$metodo]);
    }
    foreach (['descartar_alerta'=>'descartarAlerta','guardar'=>'guardar','cambiar_estado'=>'cambiarEstado','ingresar'=>'ingresar','salida'=>'salida','anular'=>'anular','prestar'=>'prestar','devolver'=>'devolver','sena'=>'sena','cerrar'=>'cerrar'] as $accion=>$metodo) {
        $router->register('medicamentos_'.$accion, 'POST', [Medicamentos::class,$metodo]);
    }
}
