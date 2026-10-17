<?php
declare(strict_types=1);
require_once __DIR__ . '/medicamentos_soporte.php';
require_once __DIR__ . '/medicamentos_consultas.php';
require_once __DIR__ . '/medicamentos_gestion.php';
require_once __DIR__ . '/medicamentos_alertas.php';
final class Medicamentos {
    use MedicamentosSoporte, MedicamentosConsultas, MedicamentosGestion, MedicamentosAlertas;
    public static function alertas(): never { $a=auth_context(); api_success(self::alertasDatos($a,$_GET)); }
    public static function descartarAlerta(): never { $a=auth_context(); api_success(self::descartarAlertaDatos($a,request_body()),'Alerta descartada.'); }
    public static function catalogo(): never { api_success(['registros'=>self::catalogoDatos(auth_context()['db'])]); }
    public static function lotes(): never { $a=auth_context(); api_success(['registros'=>self::lotesDatos($a['db'], $_GET)]); }
    public static function historial(): never { $a=auth_context(); api_success(self::historialDatos($a['db'],$_GET)); }
    public static function prestamos(): never { $a=auth_context(); api_success(self::prestamosDatos($a['db'],$_GET)); }
    public static function prestamoDetalle(): never { $a=auth_context(); api_success(self::prestamoDatos($a['db'],positive_id($_GET['id']??null,'préstamo'))); }
    public static function socios(): never { $a=auth_context(); api_success(['registros'=>self::buscarSocios($a['db'],$_GET)]); }
    public static function procedencias(): never { $a=auth_context(); api_success(['registros'=>self::buscarProcedencias($a['db'],$_GET)]); }
    public static function medios(): never { $a=auth_context(); api_success(['registros'=>$a['db']->query('SELECT id_medio_pago,nombre FROM medios_pago WHERE activo=1 ORDER BY nombre')->fetchAll()]); }
    public static function guardar(): never { $a=require_admin(); api_success(self::guardarMedicamento($a,request_body()),'Medicamento guardado.'); }
    public static function cambiarEstado(): never { $a=require_admin(); api_success(self::cambiarEstadoMedicamento($a,request_body()),'Estado actualizado.'); }
    public static function ingresar(): never { $a=require_admin(); api_success(self::ingresarStock($a,request_body()),'Ingreso de stock registrado.'); }
    public static function anular(): never { $a=require_admin(); api_success(self::anularOperacionEconomica($a,request_body()),'Operación anulada con movimientos compensatorios.'); }
    public static function salida(): never { $a=require_admin(); api_success(self::salidaStock($a,request_body()),'Movimiento de stock registrado.'); }
    public static function revisarLote(): never { $a=require_admin(); api_success(self::cambiarEstadoLote($a,request_body()),'Lote actualizado.'); }
    public static function prestar(): never { $a=require_admin(); api_success(self::crearPrestamo($a,request_body()),'Préstamo registrado.'); }
    public static function devolver(): never { $a=require_admin(); api_success(self::devolverMedicamento($a,request_body()),'Devolución registrada y stock actualizado.'); }
    public static function cerrar(): never { $a=require_admin(); api_success(self::cerrarPrestamo($a,request_body()),'Préstamo cerrado.'); }
    public static function sena(): never { $a=require_admin(); api_success(self::registrarSena($a,request_body()),'Movimiento de seña registrado.'); }
}
