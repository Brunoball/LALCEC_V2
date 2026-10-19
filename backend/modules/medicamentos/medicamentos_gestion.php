<?php
declare(strict_types=1);
trait MedicamentosGestion {
    use MedicamentosSoporte;

    protected static function guardarMedicamento(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=(int)($b['id_medicamento']??0);
            $fields=[self::req($b,'droga'),self::req($b,'nombre_comercial'),self::str($b,'laboratorio',160),self::req($b,'presentacion',100),self::req($b,'dosis',100),self::req($b,'unidad_stock',40),self::str($b,'observaciones',3000)];
            // Un vencimiento por medicamento (no por lote). El cambio de fecha afecta
            // a todo el stock existente, y queda trazado por la auditoría general.
            $vencimiento=isset($b['fecha_vencimiento']) && trim((string)$b['fecha_vencimiento'])!==''
                ? self::date($b['fecha_vencimiento'],'fecha de vencimiento') : null;
            if($id>0){
                $before=self::medicamentoBloqueado($db,$id,false);
                // Las unidades de un préstamo o de un movimiento siguen refiriéndose a
                // esta presentación: no se reinterpretan retrospectivamente.
                $q=$db->prepare('SELECT COUNT(*) FROM medicamentos_movimientos WHERE id_medicamento=?');$q->execute([$id]);
                if((int)$q->fetchColumn()>0){
                    foreach(['droga'=>0,'presentacion'=>3,'dosis'=>4,'unidad_stock'=>5] as $campo=>$pos)
                        if((string)$before[$campo]!==$fields[$pos])api_error('No podés cambiar droga, presentación, dosis o unidad con movimientos históricos. Creá un medicamento nuevo para otra presentación.');
                }
                if($vencimiento===null && (int)$before['stock_actual']>0)
                    api_error('Indicá la fecha de vencimiento del stock actual.');
                $db->prepare('UPDATE medicamentos SET droga=?,nombre_comercial=?,laboratorio=?,presentacion=?,dosis=?,unidad_stock=?,observaciones=?,fecha_vencimiento=? WHERE id_medicamento=?')
                    ->execute([...$fields,$vencimiento,$id]);
            } else {
                $before=null;
                if((int)($b['ingreso_inicial']['cantidad']??0)>0 && $vencimiento===null)
                    api_error('Indicá la fecha de vencimiento del medicamento para cargar stock.');
                $db->prepare('INSERT INTO medicamentos (droga,nombre_comercial,laboratorio,presentacion,dosis,unidad_stock,observaciones,fecha_vencimiento) VALUES (?,?,?,?,?,?,?,?)')
                    ->execute([...$fields,$vencimiento]);
                $id=(int)$db->lastInsertId();
                // Es válido crearlo con stock 0; si se carga inicial es atómico.
                if(is_array($b['ingreso_inicial']??null) && (int)($b['ingreso_inicial']['cantidad']??0)>0)
                    self::registrarIngresoStock($db,$auth,$b['ingreso_inicial'],$id,true);
            }
            self::audit($db,$auth,$before?'EDITAR':'CREAR','medicamentos',$id,$before,[...$fields,'fecha_vencimiento'=>$vencimiento]);
            return ['id_medicamento'=>$id];
        },$auth,$b,'guardarMedicamento');
    }

    protected static function cambiarEstadoMedicamento(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_medicamento']??null,'medicamento');
            $before=self::medicamentoBloqueado($db,$id,false);
            $valor=$b['activo']??null;
            if(!in_array($valor,[0,1,'0','1'],true))api_error('Estado de medicamento inválido.');
            $activo=(int)$valor;
            $motivo=null;
            if($activo===0){
                $motivo=self::str($b,'motivo_baja',500);
                if($motivo===null || (function_exists('mb_strlen') ? mb_strlen($motivo) : strlen($motivo))<3)api_error('Ingresá el motivo de la baja (mínimo 3 caracteres).');
            }
            $db->prepare('UPDATE medicamentos SET activo=?, motivo_baja=?, fecha_baja=? WHERE id_medicamento=?')
                ->execute([$activo,$motivo,$activo?null:date('Y-m-d H:i:s'),$id]);
            self::audit($db,$auth,$activo?'REACTIVAR':'DAR_BAJA','medicamentos',$id,
                ['activo'=>$before['activo'],'motivo_baja'=>$before['motivo_baja']],['activo'=>$activo,'motivo_baja'=>$motivo]);
            return ['activo'=>$activo,'motivo_baja'=>$motivo];
        },$auth,$b,'cambiarEstadoMedicamento');
    }

    protected static function ingresarStock(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            return self::registrarIngresoStock($db,$auth,$b,positive_id($b['id_medicamento']??null,'medicamento'));
        },$auth,$b,'ingresarStock');
    }
    private static function registrarIngresoStock(PDO $db,array $auth,array $b,int $id,bool $primero=false): array {
        $m=self::medicamentoBloqueado($db,$id);
        $origen=self::enum($b['origen']??'',['COMPRA','DONACION','INICIAL','AJUSTE'],'origen');
        if($origen==='INICIAL'&&!$primero)api_error('El stock inicial se carga al crear el medicamento.');
        $cantidad=self::qty($b['cantidad']??null);
        // Cuando llega mercadería nueva puede actualizarse la fecha única del
        // medicamento, sin crear lotes ni perder el historial de entradas.
        $vencimiento=$m['fecha_vencimiento']??null;
        if(array_key_exists('fecha_vencimiento',$b)){
            $vencimiento=trim((string)$b['fecha_vencimiento'])!==''
                ? self::date($b['fecha_vencimiento'],'fecha de vencimiento') : null;
        }
        if($vencimiento===null)api_error('Indicá la fecha de vencimiento antes de ingresar stock.');
        $fecha=isset($b['fecha_ingreso'])&&$b['fecha_ingreso']!==''?self::date($b['fecha_ingreso'],'fecha de ingreso'):date('Y-m-d');
        if($fecha>date('Y-m-d'))api_error('La fecha de ingreso no puede ser futura.');
        $costo=$origen==='COMPRA'?self::money($b['costo_unitario']??null):null;
        $proveedor=self::str($b,'procedencia',180);
        $egreso=null;
        if($origen==='COMPRA'){
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $total=number_format($cantidad*(float)$costo,2,'.','');
            if((float)$total>9999999999.99)api_error('Importe de compra excesivo.');
            $detalle='Compra de '.$cantidad.' '.$m['unidad_stock'].' de '.$m['nombre_comercial'];
            $egreso=self::egresoContable($db,$fecha,$medio,'COMPRA DE MEDICAMENTOS','COMPRA DE MEDICAMENTOS',$total,$detalle,$proveedor);
        }
        $tipo=['COMPRA'=>'INGRESO_COMPRA','DONACION'=>'INGRESO_DONACION','INICIAL'=>'INGRESO_INICIAL','AJUSTE'=>'AJUSTE_ENTRADA'][$origen];
        $mov=self::inventory($db,$id,$tipo,$cantidad,$cantidad,null,null,null,null,$egreso,
            self::str($b,'observaciones',500),$origen,$proveedor,$costo);
        $db->prepare('UPDATE medicamentos SET ultimo_ingreso=?, ultimo_origen=?, fecha_vencimiento=? WHERE id_medicamento=?')
            ->execute([$fecha,$origen,$vencimiento,$id]);
        self::audit($db,$auth,'INGRESO_STOCK','medicamentos_movimientos',$mov,null,['medicamento'=>$id,'origen'=>$origen,'cantidad'=>$cantidad,'egreso'=>$egreso]);
        return ['id_movimiento'=>$mov];
    }

    protected static function salidaStock(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_medicamento']??null,'medicamento');
            $m=self::medicamentoBloqueado($db,$id);
            $tipo=self::enum($b['tipo']??'',['ENTREGA_DONACION','SALIDA_VENTA','AJUSTE_SALIDA','BAJA_DESCARTE'],'tipo de salida');
            if(in_array($tipo,['ENTREGA_DONACION','SALIDA_VENTA'],true)) self::exigirVigente($m);
            $cantidad=self::qty($b['cantidad']??null);
            $nota=self::str($b,'detalle',500);
            $ingreso=null;
            if($tipo==='SALIDA_VENTA'){
                $total=self::money($b['importe']??null);
                $medio=self::medio($db,$b['id_medio_pago']??null);
                $ingreso=self::ingresoContable($db,date('Y-m-d'),$medio,'VENTA DE MEDICAMENTOS','VENTA DE MEDICAMENTOS',$total,'Venta de '.$cantidad.' '.$m['unidad_stock'].' de '.$m['nombre_comercial']);
            }
            $mov=self::inventory($db,$id,$tipo,$cantidad,-$cantidad,null,null,null,$ingreso,null,$nota);
            self::audit($db,$auth,'EGRESO_STOCK','medicamentos_movimientos',$mov,null,['medicamento'=>$id,'tipo'=>$tipo,'cantidad'=>$cantidad,'ingreso'=>$ingreso]);
            return ['id_movimiento'=>$mov];
        },$auth,$b,'salidaStock');
    }

    protected static function crearPrestamo(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $socio=positive_id($b['id_socio']??null,'socio');
            $items=$b['items']??null;
            if(!is_array($items)||count($items)<1||count($items)>30)api_error('Agregá entre 1 y 30 medicamentos.');
            $parsed=[];
            foreach($items as $item){
                if(!is_array($item))api_error('Medicamento inválido.');
                $id=positive_id($item['id_medicamento']??null,'medicamento');
                if(isset($parsed[$id]))api_error('No repitas el mismo medicamento en el préstamo.');
                $parsed[$id]=self::qty($item['cantidad']??null);
            }
            ksort($parsed,SORT_NUMERIC);
            self::bloquearMedicamentos($db,array_keys($parsed));
            $q=$db->prepare("SELECT estado FROM socios WHERE id_socio=? AND NOT EXISTS (SELECT 1 FROM socios_eliminados x WHERE x.id_socio=socios.id_socio) FOR UPDATE");
            $q->execute([$socio]);if($q->fetchColumn()!=='ACTIVO')api_error('Elegí un socio activo.');
            foreach($parsed as $id=>$cantidad){
                $m=self::medicamentoBloqueado($db,$id);
                self::exigirVigente($m);
                if((int)$m['stock_actual']<$cantidad)api_error('Stock insuficiente de '.$m['nombre_comercial'].'.');
            }
            $vence=($b['fecha_devolucion_prevista']??'')!==''?self::date($b['fecha_devolucion_prevista'],'fecha prevista'):null;
            if($vence!==null && $vence<date('Y-m-d'))api_error('La devolución prevista no puede ser pasada.');
            $db->prepare('INSERT INTO medicamentos_prestamos (id_socio,fecha_entrega,fecha_devolucion_prevista,observaciones) VALUES (?,?,?,?)')
                ->execute([$socio,date('Y-m-d H:i:s'),$vence,self::str($b,'observaciones',3000)]);
            $prestamo=(int)$db->lastInsertId();
            foreach($parsed as $id=>$cantidad){
                $db->prepare('INSERT INTO medicamentos_prestamos_detalle (id_prestamo,id_medicamento,cantidad_entregada) VALUES (?,?,?)')->execute([$prestamo,$id,$cantidad]);
                $detalle=(int)$db->lastInsertId();
                self::inventory($db,$id,'ENTREGA_PRESTAMO',$cantidad,-$cantidad,$detalle,null,$socio);
            }
            $sena=self::money($b['sena']??'0',true);
            if((float)$sena>0){
                $medio=self::medio($db,$b['id_medio_pago']??null);
                $nombre=self::nombreSocioPrestamo($db,$socio);
                $ingreso=self::ingresoContable($db,date('Y-m-d'),$medio,'SEÑAS DE MEDICAMENTOS','COBRO DE SEÑA',$sena,'Seña préstamo medicamentos #'.$prestamo,$nombre);
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_ingreso_contable) VALUES (?,?,'COBRO_SENA',?,?,?)")
                    ->execute([$prestamo,date('Y-m-d H:i:s'),$sena,$medio,$ingreso]);
            }
            self::audit($db,$auth,'CREAR_PRESTAMO','medicamentos_prestamos',$prestamo,null,['socio'=>$socio,'items'=>$parsed,'sena'=>$sena]);
            return ['id_prestamo'=>$prestamo];
        },$auth,$b,'crearPrestamo');
    }

    protected static function devolverMedicamento(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $detalle=positive_id($b['id_detalle_prestamo']??null,'detalle de préstamo');
            $q=$db->prepare('SELECT id_prestamo FROM medicamentos_prestamos_detalle WHERE id_detalle_prestamo=?');
            $q->execute([$detalle]);$prestamo=(int)$q->fetchColumn();if(!$prestamo)api_error('Detalle inexistente.');
            $q=$db->prepare('SELECT estado,id_socio FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $q->execute([$prestamo]);$p=$q->fetch();if(!$p||$p['estado']!=='ABIERTO')api_error('Préstamo no abierto.');
            $q=$db->prepare('SELECT * FROM medicamentos_prestamos_detalle WHERE id_detalle_prestamo=?');
            $q->execute([$detalle]);$d=$q->fetch();if(!$d)api_error('Detalle inexistente.');
            $id=(int)$d['id_medicamento'];
            $m=self::medicamentoBloqueado($db,$id);
            $cantidad=self::qty($b['cantidad']??null);
            $q=$db->prepare('SELECT COALESCE(SUM(cantidad),0) FROM medicamentos_prestamos_devoluciones WHERE id_detalle_prestamo=?');
            $q->execute([$detalle]);$recibido=(int)$q->fetchColumn();
            if($cantidad>(int)$d['cantidad_entregada']-$recibido)api_error('La devolución supera las unidades pendientes.');
            $nota=self::str($b,'observaciones',500);
            $db->prepare('INSERT INTO medicamentos_prestamos_devoluciones (id_detalle_prestamo,fecha_recepcion,cantidad,estado,observaciones) VALUES (?,?,?,\'APROBADA\',?)')
                ->execute([$detalle,date('Y-m-d H:i:s'),$cantidad,$nota]);
            $devolucion=(int)$db->lastInsertId();
            self::inventory($db,$id,'DEVOLUCION_LIBERADA',$cantidad,$cantidad,$detalle,$devolucion,(int)$p['id_socio'],null,null,'Devolución de préstamo'.($nota?' · '.$nota:''));
            self::audit($db,$auth,'REGISTRAR_DEVOLUCION','medicamentos_prestamos_devoluciones',$devolucion,null,['detalle'=>$detalle,'cantidad'=>$cantidad]);
            return ['id_devolucion'=>$devolucion];
        },$auth,$b,'devolverMedicamento');
    }

    /** Cierre: lo no devuelto ya fue descontado al entregar. La seña pendiente se dona sin doble cobro. */
    protected static function cerrarPrestamo(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_prestamo']??null,'préstamo');
            $q=$db->prepare('SELECT estado FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $q->execute([$id]);if($q->fetchColumn()!=='ABIERTO')api_error('El préstamo no está abierto.');
            $q=$db->prepare('SELECT d.cantidad_entregada,COALESCE(SUM(r.cantidad),0) devuelto FROM medicamentos_prestamos_detalle d LEFT JOIN medicamentos_prestamos_devoluciones r ON r.id_detalle_prestamo=d.id_detalle_prestamo WHERE d.id_prestamo=? GROUP BY d.id_detalle_prestamo');
            $q->execute([$id]);$faltantes=0;
            foreach($q->fetchAll() as $r){$faltante=(int)$r['cantidad_entregada']-(int)$r['devuelto'];if($faltante<0)api_error('Devolución inválida.');$faltantes+=$faltante;}
            $q=$db->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='COBRO_SENA' THEN monto ELSE -monto END),0) FROM medicamentos_prestamos_senas_movimientos WHERE id_prestamo=?");
            $q->execute([$id]);$centavos=(int)round((float)$q->fetchColumn()*100);
            if($centavos<0)api_error('Saldo de seña inválido.');
            $donacion=number_format($centavos/100,2,'.','');
            if($centavos>0){
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,observaciones) VALUES (?,?,'SENA_DONADA',?,'CIERRE DEFINITIVO: SEÑA CONSERVADA COMO DONACIÓN')")->execute([$id,date('Y-m-d H:i:s'),$donacion]);
                self::audit($db,$auth,'SENA_DONADA','medicamentos_prestamos_senas_movimientos',(int)$db->lastInsertId(),null,['prestamo'=>$id,'monto'=>$donacion]);
            }
            $db->prepare("UPDATE medicamentos_prestamos SET estado='CERRADO',fecha_cierre=? WHERE id_prestamo=?")->execute([date('Y-m-d H:i:s'),$id]);
            self::audit($db,$auth,'CERRAR_PRESTAMO','medicamentos_prestamos',$id,['estado'=>'ABIERTO'],['estado'=>'CERRADO','unidades_sin_devolver'=>$faltantes,'sena_donada'=>$donacion]);
            return ['estado'=>'CERRADO','unidades_sin_devolver'=>$faltantes,'sena_donada'=>$donacion];
        },$auth,$b,'cerrarPrestamo');
    }

    protected static function anularOperacionEconomica(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_movimiento']??null,'movimiento');
            $motivo=self::str($b,'motivo',500);
            if(!$motivo || (function_exists('mb_strlen') ? mb_strlen($motivo) : strlen($motivo))<10)api_error('Ingresá un motivo de anulación de al menos 10 caracteres.');
            if(!in_array($b['devolucion_confirmada']??null,[1,'1',true],true))api_error('Confirmá la devolución física y económica.');
            $q=$db->prepare('SELECT * FROM medicamentos_movimientos WHERE id_movimiento=?');$q->execute([$id]);$mov=$q->fetch();
            if(!$mov||!in_array($mov['tipo'],['INGRESO_COMPRA','SALIDA_VENTA'],true))api_error('Solo se pueden anular compras o ventas.');
            $med=(int)$mov['id_medicamento'];self::medicamentoBloqueado($db,$med,false);
            $q=$db->prepare('SELECT id_movimiento FROM medicamentos_movimientos WHERE id_movimiento_anulado=? LIMIT 1');
            $q->execute([$id]);if($q->fetchColumn())api_error('Operación ya anulada.');
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $compra=$mov['tipo']==='INGRESO_COMPRA';
            $idContable=(int)$mov[$compra?'id_egreso_contable':'id_ingreso_contable'];
            if($idContable<1)api_error('La operación no tiene asiento contable original.');
            if($compra){
                // Evitar devolución de compras cuyo inventario haya sido utilizado.
                $q=$db->prepare("SELECT COUNT(*) FROM medicamentos_movimientos WHERE id_medicamento=? AND id_movimiento>? AND variacion_disponible<0");
                $q->execute([$med,$id]);if((int)$q->fetchColumn()>0)api_error('La compra ya tuvo consumo de stock posterior. Registrá una corrección supervisada.');
                $q=$db->prepare('SELECT importe FROM contable_egresos WHERE id_egreso=? FOR UPDATE');$q->execute([$idContable]);$total=$q->fetchColumn();if($total===false)api_error('No se encontró el egreso original.');
                $comp=self::ingresoContable($db,date('Y-m-d'),$medio,'REINTEGROS DE COMPRAS DE MEDICAMENTOS','REINTEGRO DE COMPRA DE MEDICAMENTOS',(string)$total,'Anulación de compra #'.$idContable.'. '.$motivo);
                $nuevo=self::inventory($db,$med,'AJUSTE_SALIDA',(int)$mov['cantidad'],-(int)$mov['cantidad'],null,null,null,$comp,null,'ANULACIÓN DE COMPRA: '.$motivo,null,null,null,$id);
            } else {
                $q=$db->prepare('SELECT importe FROM contable_ingresos WHERE id_ingreso=? FOR UPDATE');$q->execute([$idContable]);$total=$q->fetchColumn();if($total===false)api_error('No se encontró el ingreso original.');
                $comp=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE VENTAS DE MEDICAMENTOS','DEVOLUCIÓN DE VENTA DE MEDICAMENTOS',(string)$total,'Anulación de venta #'.$idContable.'. '.$motivo);
                $nuevo=self::inventory($db,$med,'AJUSTE_ENTRADA',(int)$mov['cantidad'],(int)$mov['cantidad'],null,null,null,null,$comp,'ANULACIÓN DE VENTA: '.$motivo,null,null,null,$id);
            }
            self::audit($db,$auth,$compra?'ANULAR_COMPRA':'ANULAR_VENTA','medicamentos_movimientos',$id,['asiento'=>$idContable],['compensacion'=>$comp,'motivo'=>$motivo,'movimiento'=>$nuevo]);
            return ['operacion_anulada'=>$compra?'COMPRA':'VENTA','id_movimiento'=>$nuevo,'id_contable_compensatorio'=>$comp];
        },$auth,$b,'anularOperacionEconomica');
    }

    protected static function registrarSena(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_prestamo']??null,'préstamo');
            self::enum($b['tipo']??'',['DEVOLUCION_SENA'],'movimiento de seña');
            $monto=self::money($b['monto']??null);
            $q=$db->prepare('SELECT * FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');$q->execute([$id]);$p=$q->fetch();
            if(!$p||$p['estado']!=='ABIERTO')api_error('Préstamo no abierto.');
            $q=$db->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='COBRO_SENA' THEN monto ELSE -monto END),0) FROM medicamentos_prestamos_senas_movimientos WHERE id_prestamo=?");
            $q->execute([$id]);$saldo=(float)$q->fetchColumn();
            if((int)round((float)$monto*100)>(int)round($saldo*100))api_error('El reintegro supera la seña pendiente.');
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $nombre=self::nombreSocioPrestamo($db,(int)$p['id_socio']);
            $egreso=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE SEÑAS','DEVOLUCIÓN DE SEÑA',$monto,'Devolución seña préstamo #'.$id,$nombre);
            $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_egreso_contable,observaciones) VALUES (?,?,'DEVOLUCION_SENA',?,?,?,?)")
                ->execute([$id,date('Y-m-d H:i:s'),$monto,$medio,$egreso,self::str($b,'observaciones',500)]);
            $mov=(int)$db->lastInsertId();
            self::audit($db,$auth,'DEVOLUCION_SENA','medicamentos_prestamos_senas_movimientos',$mov,null,['prestamo'=>$id,'monto'=>$monto,'egreso'=>$egreso]);
            return ['id_movimiento_sena'=>$mov];
        },$auth,$b,'registrarSena');
    }
}
