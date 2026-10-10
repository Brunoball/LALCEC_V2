<?php
declare(strict_types=1);
trait MedicamentosGestion {
    // Declara la dependencia para que el editor resuelva los helpers del módulo.
    // Medicamentos también carga este trait: PHP reutiliza la misma implementación.
    use MedicamentosSoporte;

    protected static function guardarMedicamento(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=(int)($b['id_medicamento']??0);
            $fields=[self::req($b,'droga'),self::req($b,'nombre_comercial'),self::str($b,'laboratorio',160),self::req($b,'presentacion',100),self::req($b,'dosis',100),self::req($b,'unidad_stock',40),self::str($b,'observaciones',3000)];
            if($id){
                $s=$db->prepare('SELECT * FROM medicamentos WHERE id_medicamento=? FOR UPDATE');$s->execute([$id]);$before=$s->fetch();if(!$before)api_error('Medicamento no encontrado.');
                // La dosis/unidad/tipo con lotes históricos no pueden reinterpretarse.
                $q=$db->prepare('SELECT COUNT(*) FROM medicamentos_lotes WHERE id_medicamento=?');
                $q->execute([$id]);
                if((int)$q->fetchColumn()>0) {
                    foreach(['droga','presentacion','dosis','unidad_stock'] as $field) {
                        $idx=['droga'=>0,'presentacion'=>3,'dosis'=>4,'unidad_stock'=>5][$field];
                        if((string)$before[$field]!== (string)$fields[$idx])
                            api_error('No podés cambiar droga, presentación, dosis ni unidad con lotes históricos. Creá otro medicamento para la nueva presentación.');
                    }
                }
                $s=$db->prepare('UPDATE medicamentos SET droga=?,nombre_comercial=?,laboratorio=?,presentacion=?,dosis=?,unidad_stock=?,observaciones=? WHERE id_medicamento=?');$s->execute([...$fields,$id]);
            } else {
                $first=$b['ingreso_inicial']??null;
                if(!is_array($first)) api_error('Completá el ingreso inicial del medicamento.');
                $before=null; $s=$db->prepare('INSERT INTO medicamentos (droga,nombre_comercial,laboratorio,presentacion,dosis,unidad_stock,observaciones) VALUES (?,?,?,?,?,?,?)');$s->execute($fields);$id=(int)$db->lastInsertId();
                // Alta y primer ingreso atómicos: no se deja un medicamento a medio cargar.
                self::registrarIngresoStock($db,$auth,$first,$id,true);
            }
            self::audit($db,$auth,$before?'EDITAR':'CREAR','medicamentos',$id,$before,$fields);
            return ['id_medicamento'=>$id];
        });
    }
    protected static function cambiarEstadoMedicamento(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_medicamento']??null);$s=$db->prepare('SELECT activo FROM medicamentos WHERE id_medicamento=? FOR UPDATE');$s->execute([$id]);$old=$s->fetchColumn();if($old===false)api_error('Medicamento no encontrado.');
            $valor=$b['activo']??null;
            if(!in_array($valor,[0,1,'0','1'],true)) api_error('El estado del medicamento debe ser ACTIVO o BAJA.');
            $state=(int)$valor;
            $db->prepare('UPDATE medicamentos SET activo=? WHERE id_medicamento=?')->execute([$state,$id]);
            self::audit($db,$auth,'CAMBIAR_ESTADO','medicamentos',$id,['activo'=>$old],['activo'=>$state]);return ['activo'=>$state];
        });
    }
    protected static function ingresarStock(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $med=positive_id($b['id_medicamento']??null,'medicamento');
            return self::registrarIngresoStock($db,$auth,$b,$med);
        });
    }
    /** Se comparte entre el primer ingreso al crear y los ingresos posteriores. */
    private static function registrarIngresoStock(PDO $db,array $auth,array $b,int $med,bool $primerIngreso=false): array {
        $q=$db->prepare('SELECT activo FROM medicamentos WHERE id_medicamento=? FOR UPDATE');
        $q->execute([$med]);
        if((int)$q->fetchColumn()!==1) api_error('Medicamento inactivo o inexistente.');
        $origin=self::enum($b['origen']??'',['DONACION','COMPRA','INICIAL'],'origen');
        if($origin==='INICIAL' && !$primerIngreso) api_error('STOCK INICIAL solo está permitido al crear un medicamento nuevo.');
        $qty=self::qty($b['cantidad']??null);
        $date=self::date($b['fecha_ingreso']??null,'fecha de ingreso');
        $expiry=self::date($b['fecha_vencimiento']??null,'fecha de vencimiento');
        if($date>date('Y-m-d')) api_error('La fecha de ingreso no puede ser futura.');
        if($expiry<$date) api_error('El vencimiento no puede ser anterior al ingreso.');
        if($expiry<date('Y-m-d')) api_error('No se pueden ingresar medicamentos vencidos al stock disponible.');
        $cost=$origin==='COMPRA'?self::money($b['costo_unitario']??null):null;
        $method=null;$expense=null;
        if($origin==='COMPRA') {
            $method=self::medio($db,$b['id_medio_pago']??null);
            $total=number_format($qty*(float)$cost,2,'.','');
            // El importe contable comparte la misma transacción que el lote.
            if((float)$total>9999999999.99) api_error('El importe de la compra es demasiado alto.');
            $procedencia=trim((string)self::str($b,'procedencia',180));
            $proveedor=$procedencia!=='' ? (function_exists('mb_substr') ? mb_substr($procedencia,0,160,'UTF-8') : substr($procedencia,0,160)) : null;
            $expense=self::egresoContable($db,$date,$method,'COMPRA DE MEDICAMENTOS','COMPRA DE MEDICAMENTOS',$total,'Ingreso de stock: '.$procedencia,$proveedor);
        }
        $s=$db->prepare("INSERT INTO medicamentos_lotes (id_medicamento,numero_lote,fecha_vencimiento,fecha_ingreso,origen,procedencia,costo_unitario,cantidad_disponible,observaciones) VALUES (?,?,?,?,?,?,?,?,?)");
        $s->execute([$med,self::str($b,'numero_lote',100),$expiry,$date,$origin,self::str($b,'procedencia',180),$cost,0,self::str($b,'observaciones',3000)]);
        $lot=(int)$db->lastInsertId();
        self::inventory($db,$lot,['DONACION'=>'INGRESO_DONACION','COMPRA'=>'INGRESO_COMPRA','INICIAL'=>'INGRESO_INICIAL'][$origin],$qty,$qty,0,null,null,null,null,$expense,'Alta de lote');
        self::audit($db,$auth,'INGRESO_STOCK','medicamentos_lotes',$lot,null,['medicamento'=>$med,'cantidad'=>$qty,'origen'=>$origin,'egreso'=>$expense]);
        return ['id_lote'=>$lot];
    }
    /** Entregas automáticas FEFO (primero vence, primero sale).
     * Compatibilidad: id_lote conserva la operación sobre un lote explícito.
     */
    protected static function salidaStock(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $type=self::enum($b['tipo']??'',['ENTREGA_DONACION','SALIDA_VENTA','AJUSTE_ENTRADA','AJUSTE_SALIDA','BAJA_VENCIMIENTO','BAJA_DESCARTE'],'movimiento');
            $qty=self::qty($b['cantidad']??null);
            $note=self::str($b,'detalle',500);
            $requiresUsable=in_array($type,['ENTREGA_DONACION','SALIDA_VENTA'],true);
            $movimientos=[];
            if(isset($b['id_medicamento']) && $b['id_medicamento']!=='' && isset($b['id_lote']) && $b['id_lote']!=='')
                api_error('Elegí un medicamento o un lote específico, no ambos.');
            if(isset($b['id_medicamento']) && $b['id_medicamento']!=='') {
                if($type==='AJUSTE_ENTRADA')api_error('Para un ajuste de entrada elegí un lote explícito.');
                $idMed=positive_id($b['id_medicamento'],'medicamento');
                // Bloquear primero el medicamento: serializa cambios de estado y
                // evita mezclas con altas; luego bloquear los lotes en orden estable.
                $q=$db->prepare('SELECT activo FROM medicamentos WHERE id_medicamento=? FOR UPDATE');
                $q->execute([$idMed]);$activo=$q->fetchColumn();
                if($activo===false)api_error('Medicamento inexistente.');
                if($requiresUsable && (int)$activo!==1)api_error('El medicamento está dado de baja.');
                $q=$db->prepare("SELECT * FROM medicamentos_lotes WHERE id_medicamento=? AND estado<>'DESCARTADO' ORDER BY fecha_vencimiento,id_lote FOR UPDATE");
                $q->execute([$idMed]);
                $lotes=$q->fetchAll();$faltan=$qty;
                foreach($lotes as $lote){
                    if($requiresUsable && ($lote['estado']!=='ACTIVO' || $lote['fecha_vencimiento']<date('Y-m-d'))) continue;
                    if($type==='BAJA_VENCIMIENTO' && $lote['fecha_vencimiento']>=date('Y-m-d')) continue;
                    $usar=min($faltan,(int)$lote['cantidad_disponible']);
                    if($usar<=0)continue;
                    $movimientos[]=['lote'=>(int)$lote['id_lote'],'cantidad'=>$usar,'restante'=>(int)$lote['cantidad_disponible']-$usar,'cuarentena'=>(int)$lote['cantidad_cuarentena']];
                    $faltan-=$usar;
                    if($faltan===0)break;
                }
                if($faltan>0)api_error('Stock insuficiente entre los lotes habilitados para este movimiento.');
            } else {
                $id=positive_id($b['id_lote']??null,'lote');
                $lote=self::lockedLote($db,$id,$requiresUsable || $type==='AJUSTE_ENTRADA');
                if($lote['estado']==='DESCARTADO')api_error('No se puede mover stock de un lote descartado.');
                if($type==='BAJA_VENCIMIENTO' && $lote['fecha_vencimiento']>=date('Y-m-d'))
                    api_error('Solo podés registrar baja por vencimiento de lotes vencidos.');
                if($type!=='AJUSTE_ENTRADA' && (int)$lote['cantidad_disponible']<$qty)
                    api_error('Stock insuficiente en el lote seleccionado.');
                $movimientos[]=['lote'=>$id,'cantidad'=>$qty,'restante'=>(int)$lote['cantidad_disponible']-($type==='AJUSTE_ENTRADA'?0:$qty),'cuarentena'=>(int)$lote['cantidad_cuarentena']];
            }
            $ing=null;
            if($type==='SALIDA_VENTA'){
                $amount=self::money($b['importe']??null);
                $medio=self::medio($db,$b['id_medio_pago']??null);
                // Un único asiento para el total de venta, aun con múltiples lotes.
                $ing=self::ingresoContable($db,date('Y-m-d'),$medio,'VENTA DE MEDICAMENTOS','VENTA DE MEDICAMENTOS',$amount,'Venta de medicamentos, lotes: '.implode(',',array_slice(array_column($movimientos,'lote'),0,30)).(count($movimientos)>30?' Y OTROS '.(count($movimientos)-30).' LOTES':''));
            }
            $ids=[];
            foreach($movimientos as $op){
                $delta=$type==='AJUSTE_ENTRADA'?$op['cantidad']:-$op['cantidad'];
                $mov=self::inventory($db,$op['lote'],$type,$op['cantidad'],$delta,0,null,null,null,$ing,null,$note);
                $ids[]=$mov;
                if(in_array($type,['BAJA_VENCIMIENTO','BAJA_DESCARTE'],true) && $op['restante']===0 && $op['cuarentena']===0)
                    $db->prepare("UPDATE medicamentos_lotes SET estado='DESCARTADO' WHERE id_lote=?")->execute([$op['lote']]);
                self::audit($db,$auth,'MOVIMIENTO_STOCK','medicamentos_movimientos',$mov,null,
                    ['lote'=>$op['lote'],'tipo'=>$type,'cantidad'=>$op['cantidad'],'ingreso'=>$ing]);
            }
            return ['id_movimiento'=>$ids[0],'id_movimientos'=>$ids,'lotes_utilizados'=>count($ids)];
        });
    }
    protected static function cambiarEstadoLote(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_lote']??null,'lote');$lot=self::lockedLote($db,$id);$state=self::enum($b['estado']??'',['ACTIVO','BLOQUEADO','DESCARTADO'],'estado');
            if($lot['estado']==='DESCARTADO' && $state!=='DESCARTADO')
                api_error('Un lote descartado no puede reactivarse. Ingresá un nuevo lote para recuperar existencias.');
            if($state==='DESCARTADO' && ((int)$lot['cantidad_disponible']+(int)$lot['cantidad_cuarentena'])>0) api_error('Primero registrá las bajas de todas las unidades del lote.');
            if($state==='ACTIVO' && $lot['fecha_vencimiento']<date('Y-m-d'))api_error('No podés activar un lote vencido.');
            $db->prepare('UPDATE medicamentos_lotes SET estado=? WHERE id_lote=?')->execute([$state,$id]);
            self::audit($db,$auth,'ESTADO_LOTE','medicamentos_lotes',$id,['estado'=>$lot['estado']],['estado'=>$state]);return ['estado'=>$state];
        });
    }
    protected static function crearPrestamo(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $socio=positive_id($b['id_socio']??null,'socio');
            $items=$b['items']??[];if(!is_array($items)||count($items)<1||count($items)>30)api_error('Agregá entre 1 y 30 lotes al préstamo.');
            $parsed=[];
            foreach($items as $item){if(!is_array($item))api_error('Medicamento inválido.');$lot=positive_id($item['id_lote']??null,'lote');if(isset($parsed[$lot]))api_error('No repitas un lote.');$parsed[$lot]=self::qty($item['cantidad']??null);}
            ksort($parsed,SORT_NUMERIC);
            // Todos los medicamentos se bloquean primero en orden numérico,
            // incluso cuando el préstamo incluye lotes de varios medicamentos.
            // Las filas de lotes se bloquean después, también en orden estable.
            $placeholders=implode(',',array_fill(0,count($parsed),'?'));
            $q=$db->prepare('SELECT id_lote,id_medicamento FROM medicamentos_lotes WHERE id_lote IN ('.$placeholders.')');
            $q->execute(array_keys($parsed));
            $parents=[];
            foreach($q->fetchAll() as $r) $parents[(int)$r['id_lote']]=(int)$r['id_medicamento'];
            if(count($parents)!==count($parsed))api_error('Uno de los lotes elegidos ya no existe.');
            self::bloquearMedicamentos($db,array_values($parents));
            $q=$db->prepare("SELECT estado FROM socios WHERE id_socio=? AND NOT EXISTS (SELECT 1 FROM socios_eliminados x WHERE x.id_socio=socios.id_socio) FOR UPDATE");
            $q->execute([$socio]);if($q->fetchColumn()!=='ACTIVO')api_error('Elegí un socio activo.');
            foreach($parsed as $lot=>$qty){$r=self::lockedLote($db,$lot,true);if((int)$r['cantidad_disponible']<$qty)api_error('Stock insuficiente de '.$r['nombre_comercial'].'.');}
            $due=isset($b['fecha_devolucion_prevista'])&&$b['fecha_devolucion_prevista']!==''?self::date($b['fecha_devolucion_prevista'],'fecha prevista'):null;
            if($due!==null && $due<date('Y-m-d'))api_error('La devolución prevista no puede tener una fecha pasada.');
            $db->prepare('INSERT INTO medicamentos_prestamos (id_socio,fecha_entrega,fecha_devolucion_prevista,observaciones) VALUES (?,?,?,?)')->execute([$socio,date('Y-m-d H:i:s'),$due,self::str($b,'observaciones',3000)]);$loan=(int)$db->lastInsertId();
            foreach($parsed as $lot=>$qty){$db->prepare('INSERT INTO medicamentos_prestamos_detalle (id_prestamo,id_lote,cantidad_entregada) VALUES (?,?,?)')->execute([$loan,$lot,$qty]);$detail=(int)$db->lastInsertId();self::inventory($db,$lot,'ENTREGA_PRESTAMO',$qty,-$qty,0,$detail,null,$socio);}
            $money=self::money($b['sena']??'0',true);
            if((float)$money>0){$medio=self::medio($db,$b['id_medio_pago']??null);$ing=self::ingresoContable($db,date('Y-m-d'),$medio,'SEÑAS DE MEDICAMENTOS','COBRO DE SEÑA',$money,'Seña préstamo medicamentos #'.$loan);
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_ingreso_contable) VALUES (?,?,'COBRO_SENA',?,?,?)")->execute([$loan,date('Y-m-d H:i:s'),$money,$medio,$ing]);}
            self::audit($db,$auth,'CREAR_PRESTAMO','medicamentos_prestamos',$loan,null,['socio'=>$socio,'items'=>$parsed,'sena'=>$money]);return ['id_prestamo'=>$loan];
        });
    }
    /** La devolución queda registrada y disponible inmediatamente (sin paso de aprobación).
     * Se recibe en un lote nuevo para respetar el vencimiento real del producto devuelto.
     */
    protected static function devolverMedicamento(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_detalle_prestamo']??null,'detalle');
            // Serializar con el cierre para impedir recibir después de cerrar.
            $q=$db->prepare('SELECT id_prestamo FROM medicamentos_prestamos_detalle WHERE id_detalle_prestamo=?');
            $q->execute([$id]);$loan=(int)$q->fetchColumn();
            if($loan<1)api_error('El detalle del préstamo no existe.');
            $q=$db->prepare('SELECT estado FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $q->execute([$loan]);if($q->fetchColumn()!=='ABIERTO')api_error('El préstamo no está abierto.');
            // También ordenar devoluciones viejas del mismo préstamo, sin aprobaciones manuales.
            self::regularizarDevolucionesAnteriores($db,$auth,$loan);
            // El préstamo está bloqueado: ninguna otra devolución de este préstamo
            // puede competir. Después bloqueamos el medicamento y el lote original
            // respetando el orden del resto de movimientos de stock.
            $s=$db->prepare('SELECT d.*,p.id_socio FROM medicamentos_prestamos_detalle d JOIN medicamentos_prestamos p ON p.id_prestamo=d.id_prestamo WHERE d.id_detalle_prestamo=?');
            $s->execute([$id]);$detail=$s->fetch();if(!$detail)api_error('El detalle del préstamo no existe.');
            $original=self::lockedLote($db,(int)$detail['id_lote']);
            $qty=self::qty($b['cantidad']??null);
            $s=$db->prepare("SELECT COALESCE(SUM(cantidad),0) FROM medicamentos_prestamos_devoluciones WHERE id_detalle_prestamo=? AND estado IN ('PENDIENTE_REVISION','APROBADA')");
            $s->execute([$id]);$received=(int)$s->fetchColumn();
            if($qty>(int)$detail['cantidad_entregada']-$received)api_error('La devolución supera las unidades pendientes.');
            $expiry=self::date($b['fecha_vencimiento']??null,'vencimiento del medicamento recibido');
            if($expiry<date('Y-m-d'))api_error('No se pueden reingresar medicamentos vencidos.');
            $note=self::str($b,'observaciones',500);
            // Una devolución no debe blanquear un lote bloqueado/descartado,
            // vencido o un medicamento dado de baja. Se recibe el stock, pero
            // BLOQUEADO: sólo una reactivación deliberada permitirá entregarlo.
            $estadoRecibido=($original['estado']==='ACTIVO'
                && $original['fecha_vencimiento']>=date('Y-m-d')
                && (int)$original['medicamento_activo']===1) ? 'ACTIVO' : 'BLOQUEADO';
            $s=$db->prepare("INSERT INTO medicamentos_lotes (id_medicamento,numero_lote,fecha_ingreso,fecha_vencimiento,origen,procedencia,cantidad_disponible,cantidad_cuarentena,observaciones,estado) VALUES (?,?,?,?,'DEVOLUCION',?,0,0,?,?)");
            $s->execute([(int)$original['id_medicamento'],self::str($b,'numero_lote',100),date('Y-m-d'),$expiry,'DEVOLUCIÓN PRÉSTAMO #'.$loan,$note,$estadoRecibido]);
            $lot=(int)$db->lastInsertId();
            // La base mantiene los estados heredados: APROBADA representa devolución registrada.
            $db->prepare("INSERT INTO medicamentos_prestamos_devoluciones (id_detalle_prestamo,id_lote_recibido,fecha_recepcion,cantidad,estado,fecha_revision,observaciones) VALUES (?,?,?,?, 'APROBADA',?,?)")
                ->execute([$id,$lot,date('Y-m-d H:i:s'),$qty,date('Y-m-d H:i:s'),$note]);
            $ret=(int)$db->lastInsertId();
            self::inventory($db,$lot,'DEVOLUCION_LIBERADA',$qty,$qty,0,$id,$ret,(int)$detail['id_socio'],null,null,'Devolución registrada');
            self::audit($db,$auth,'REGISTRAR_DEVOLUCION','medicamentos_prestamos_devoluciones',$ret,null,['detalle'=>$id,'cantidad'=>$qty,'lote_recibido'=>$lot]);
            return ['id_devolucion'=>$ret,'id_lote_recibido'=>$lot,'estado_lote'=>$estadoRecibido];
        });
    }
    /** Compatibilidad con devoluciones antiguas que quedaron pendientes de revisión.
     * Al cerrar, se regularizan sin pedir al usuario una aprobación extra.
     */
    private static function regularizarDevolucionesAnteriores(PDO $db,array $auth,int $idPrestamo): void {
        $s=$db->prepare("SELECT r.*,d.id_detalle_prestamo,p.id_socio
            FROM medicamentos_prestamos_devoluciones r
            JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo
            JOIN medicamentos_prestamos p ON p.id_prestamo=d.id_prestamo
            WHERE d.id_prestamo=? AND r.estado='PENDIENTE_REVISION' FOR UPDATE");
        $s->execute([$idPrestamo]);
        foreach($s->fetchAll() as $r){
            if (empty($r['id_lote_recibido'])) api_error('La devolución histórica #'.$r['id_devolucion'].' no tiene lote recibido. Requiere revisión administrativa antes de cerrar el préstamo para no inventar stock.');
            $lot=self::lockedLote($db,(int)$r['id_lote_recibido']);
            $qty=(int)$r['cantidad'];
            if((int)$lot['cantidad_cuarentena']<$qty)api_error('Los datos de una devolución anterior requieren corrección de stock.');
            // No reactivar automáticamente un lote que ya fue bloqueado o
            // descartado. Si venció, sólo damos de baja la cuarentena de esta
            // devolución, sin descartar existencias ajenas a ella.
            $aprobada=$lot['fecha_vencimiento']>=date('Y-m-d') && $lot['estado']!=='DESCARTADO';
            if($aprobada){
                // Si el lote original perdió aptitud, bloquear también la
                // devolución anterior antes de hacerla disponible.
                $detalleOriginal=$db->prepare('SELECT id_lote FROM medicamentos_prestamos_detalle WHERE id_detalle_prestamo=?');
                $detalleOriginal->execute([(int)$r['id_detalle_prestamo']]);
                $idOriginal=(int)$detalleOriginal->fetchColumn();
                if($idOriginal<1) api_error('No se encontró el lote original de la devolución anterior.');
                $original=self::lockedLote($db,$idOriginal);
                $bloquear=($original['estado']!=='ACTIVO'
                    || $original['fecha_vencimiento']<date('Y-m-d')
                    || (int)$original['medicamento_activo']!==1);
                if($bloquear && $lot['estado']==='ACTIVO'){
                    $db->prepare("UPDATE medicamentos_lotes SET estado='BLOQUEADO' WHERE id_lote=?")->execute([(int)$r['id_lote_recibido']]);
                }
                self::inventory($db,(int)$r['id_lote_recibido'],'DEVOLUCION_LIBERADA',$qty,$qty,-$qty,(int)$r['id_detalle_prestamo'],(int)$r['id_devolucion'],(int)$r['id_socio'],null,null,'Regularización de devolución anterior');
            }else{
                self::inventory($db,(int)$r['id_lote_recibido'],'DEVOLUCION_DESCARTADA',$qty,0,-$qty,(int)$r['id_detalle_prestamo'],(int)$r['id_devolucion'],(int)$r['id_socio'],null,null,'Devolución anterior no incorporada');
                // Sólo un lote ACTIVO, realmente vacío y sin cuarentena puede
                // pasar a DESCARTADO; preservar siempre BLOQUEADO y DESCARTADO.
                if($lot['estado']==='ACTIVO'
                    && (int)$lot['cantidad_disponible']===0
                    && (int)$lot['cantidad_cuarentena']===$qty){
                    $db->prepare("UPDATE medicamentos_lotes SET estado='DESCARTADO' WHERE id_lote=?")->execute([(int)$r['id_lote_recibido']]);
                }
            }
            $estado=$aprobada?'APROBADA':'RECHAZADA';
            $db->prepare('UPDATE medicamentos_prestamos_devoluciones SET estado=?,fecha_revision=? WHERE id_devolucion=?')
                ->execute([$estado,date('Y-m-d H:i:s'),$r['id_devolucion']]);
            self::audit($db,$auth,'NORMALIZAR_DEVOLUCION_ANTERIOR','medicamentos_prestamos_devoluciones',(int)$r['id_devolucion'],['estado'=>'PENDIENTE_REVISION'],['estado'=>$estado]);
        }
    }
    /** Cierre definitivo: las unidades prestadas ya salieron del stock al entregarlas.
     * Si el beneficiario no repone lo pendiente, NO se realiza otra salida.
     * La seña sin reintegrar pasa a donación sin crear un segundo ingreso en caja.
     */
    protected static function cerrarPrestamo(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_prestamo']??null,'préstamo');
            $s=$db->prepare('SELECT estado FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $s->execute([$id]);
            if($s->fetchColumn()!=='ABIERTO')api_error('El préstamo no está abierto.');

            // Las devoluciones de versiones anteriores se normalizan en el mismo cierre.
            self::regularizarDevolucionesAnteriores($db,$auth,$id);

            $s=$db->prepare("SELECT d.cantidad_entregada,COALESCE(SUM(CASE WHEN r.estado='APROBADA' THEN r.cantidad ELSE 0 END),0) AS devuelto
                FROM medicamentos_prestamos_detalle d
                LEFT JOIN medicamentos_prestamos_devoluciones r ON r.id_detalle_prestamo=d.id_detalle_prestamo
                WHERE d.id_prestamo=? GROUP BY d.id_detalle_prestamo");
            $s->execute([$id]);
            $sinDevolver=0;
            foreach($s->fetchAll() as $row){
                $pendiente=(int)$row['cantidad_entregada']-(int)$row['devuelto'];
                if($pendiente<0)api_error('Las devoluciones superan la cantidad entregada.');
                $sinDevolver+=$pendiente;
            }

            // El bloqueo del préstamo serializa también los cambios de seña de registrarSena().
            $s=$db->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='COBRO_SENA' THEN monto ELSE -monto END),0) AS saldo
                FROM medicamentos_prestamos_senas_movimientos WHERE id_prestamo=?");
            $s->execute([$id]);
            $centavos=(int)round((float)$s->fetchColumn()*100);
            if($centavos<0)api_error('La seña presenta un saldo inválido.');
            $donado=number_format($centavos/100,2,'.','');
            if($centavos>0){
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos
                    (id_prestamo,fecha_movimiento,tipo,monto,observaciones)
                    VALUES (?,?,'SENA_DONADA',?,'CIERRE DEFINITIVO: SEÑA CONSERVADA COMO DONACIÓN')")
                    ->execute([$id,date('Y-m-d H:i:s'),$donado]);
                $idMov=(int)$db->lastInsertId();
                self::audit($db,$auth,'SENA_DONADA','medicamentos_prestamos_senas_movimientos',$idMov,null,
                    ['prestamo'=>$id,'monto'=>$donado,'motivo'=>'CIERRE_DEFINITIVO']);
            }
            $db->prepare("UPDATE medicamentos_prestamos SET estado='CERRADO',fecha_cierre=? WHERE id_prestamo=?")
                ->execute([date('Y-m-d H:i:s'),$id]);
            self::audit($db,$auth,'CERRAR_PRESTAMO','medicamentos_prestamos',$id,
                ['estado'=>'ABIERTO'],['estado'=>'CERRADO','unidades_sin_devolver'=>$sinDevolver,'sena_donada'=>$donado]);
            return ['estado'=>'CERRADO','unidades_sin_devolver'=>$sinDevolver,'sena_donada'=>$donado];
        });
    }
    /**
     * Reversión compensatoria: conserva el documento original y crea movimientos
     * inversos en stock y caja, en una sola transacción auditable. Solo se permite
     * una reversión completa y real por compra o venta.
     */
    protected static function anularOperacionEconomica(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db) use($auth,$b): array {
            $id=positive_id($b['id_movimiento']??null,'movimiento original');
            $motivo=self::req($b,'motivo',400);
            if (strlen(trim($motivo))<10) api_error('Explicá el motivo de la anulación con al menos 10 caracteres.');
            if (($b['devolucion_confirmada']??null)!==true) api_error('Confirmá que se realizó la devolución física de medicamentos y el movimiento de dinero correspondiente.');
            $s=$db->prepare('SELECT m.*,l.id_medicamento FROM medicamentos_movimientos m
                JOIN medicamentos_lotes l ON l.id_lote=m.id_lote WHERE m.id_movimiento=?');
            $s->execute([$id]); $original=$s->fetch();
            if (!$original || !in_array($original['tipo'],['INGRESO_COMPRA','SALIDA_VENTA'],true))
                api_error('Solo se pueden anular compras y ventas originales desde esta acción.');
            $tipo=$original['tipo'];
            $idMed=(int)$original['id_medicamento'];
            $esCompra=$tipo==='INGRESO_COMPRA';
            // Una misma venta puede estar compuesta por múltiples medicamentos.
            // Bloquear TODOS los padres (ordenados) antes de modificar stock,
            // manteniendo el mismo orden de locks que el resto del módulo.
            $medicamentosOperacion=[$idMed];
            if (!$esCompra) {
                $ids=$db->prepare("SELECT DISTINCT l.id_medicamento FROM medicamentos_movimientos m
                    JOIN medicamentos_lotes l ON l.id_lote=m.id_lote
                    WHERE m.id_ingreso_contable=? AND m.tipo='SALIDA_VENTA'");
                $ids->execute([$original['id_ingreso_contable']]);
                $medicamentosOperacion=array_map('intval',$ids->fetchAll(PDO::FETCH_COLUMN));
                if (!$medicamentosOperacion || !in_array($idMed,$medicamentosOperacion,true))
                    api_error('La venta original no tiene movimientos válidos.');
            }
            self::bloquearMedicamentos($db,$medicamentosOperacion);
            // No permitir métodos inactivos en reintegros; mismo orden de bloqueos
            // (medicamento -> medio) que el resto de operaciones de stock.
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $idContable=(int)$original[$esCompra?'id_egreso_contable':'id_ingreso_contable'];
            if ($idContable<1) api_error('El movimiento no tiene asiento contable original. No puede anularse automáticamente.');
            $etiqueta=$esCompra?'COMPRA':'VENTA';
            $marca='ANULACION '.$etiqueta.' #'.$idContable;
            // Las operaciones de un mismo medicamento se serializan con el
            // bloqueo padre. La marca identifica la operación (venta multi-lote).
            $s=$db->prepare('SELECT 1 FROM medicamentos_movimientos x
                WHERE x.tipo=? AND x.detalle=? LIMIT 1');
            $s->execute([$esCompra?'AJUSTE_SALIDA':'AJUSTE_ENTRADA',$marca]);
            if ($s->fetchColumn()!==false) api_error('Esta operación económica ya fue anulada. No se puede repetir.');
            if ($esCompra) {
                $s=$db->prepare('SELECT mov.*,l.cantidad_disponible,l.cantidad_cuarentena,l.estado
                    FROM medicamentos_movimientos mov
                    JOIN medicamentos_lotes l ON l.id_lote=mov.id_lote
                    WHERE mov.id_movimiento=? FOR UPDATE');
                $s->execute([$id]);$compra=$s->fetch();
                if (!$compra || $compra['tipo']!=='INGRESO_COMPRA' || (int)$compra['id_egreso_contable']!==$idContable)
                    api_error('La compra original cambió. Actualizá el historial.');
                $s=$db->prepare('SELECT 1 FROM medicamentos_movimientos WHERE id_lote=? AND id_movimiento<>? LIMIT 1');
                $s->execute([(int)$compra['id_lote'],$id]);
                if ($s->fetchColumn()!==false || (int)$compra['cantidad_cuarentena']!==0
                    || (int)$compra['cantidad_disponible']!==(int)$compra['cantidad'])
                    api_error('No se puede anular automáticamente: este lote ya tuvo movimientos o no conserva íntegro el stock comprado. Registrá una corrección supervisada.');
                $s=$db->prepare('SELECT importe FROM contable_egresos WHERE id_egreso=? FOR UPDATE');
                $s->execute([$idContable]);$importe=$s->fetchColumn();
                if ($importe===false) api_error('El egreso contable original ya no existe.');
                $nuevoAsiento=self::ingresoContable($db,date('Y-m-d'),$medio,
                    'REINTEGROS DE COMPRAS DE MEDICAMENTOS','REINTEGRO DE COMPRA DE MEDICAMENTOS',(string)$importe,
                    'Anulación de compra #'.$idContable.'. '.$motivo);
                $nuevoMov=self::inventory($db,(int)$compra['id_lote'],'AJUSTE_SALIDA',(int)$compra['cantidad'],
                    -(int)$compra['cantidad'],0,null,null,null,$nuevoAsiento,null,$marca);
                $movimientos=[$nuevoMov];
            } else {
                $s=$db->prepare('SELECT mov.*,l.estado,l.id_medicamento,l.numero_lote,l.fecha_vencimiento
                    FROM medicamentos_movimientos mov
                    JOIN medicamentos_lotes l ON l.id_lote=mov.id_lote
                    WHERE mov.id_ingreso_contable=? AND mov.tipo=\'SALIDA_VENTA\'
                    ORDER BY mov.id_lote, mov.id_movimiento FOR UPDATE');
                $s->execute([$idContable]);$ventas=$s->fetchAll();
                $idsOrigen=array_map(static fn(array $row): int=>(int)$row['id_movimiento'],$ventas);
                if (!$ventas || !in_array($id,$idsOrigen,true)) api_error('La venta original ya no existe.');
                foreach ($ventas as $venta) {
                    if (!in_array((int)$venta['id_medicamento'],$medicamentosOperacion,true))
                        api_error('Los medicamentos de la venta cambiaron. Actualizá el historial.');
                    if ($venta['estado']==='DESCARTADO')
                        api_error('No puede revertirse automáticamente: uno de los lotes fue descartado. Registrá la devolución mediante un nuevo lote supervisado.');
                }
                $s=$db->prepare('SELECT importe FROM contable_ingresos WHERE id_ingreso=? FOR UPDATE');
                $s->execute([$idContable]);$importe=$s->fetchColumn();
                if ($importe===false) api_error('El ingreso contable original ya no existe.');
                $nuevoAsiento=self::egresoContable($db,date('Y-m-d'),$medio,
                    'DEVOLUCIONES DE VENTAS DE MEDICAMENTOS','DEVOLUCIÓN DE VENTA DE MEDICAMENTOS',(string)$importe,
                    'Anulación de venta #'.$idContable.'. '.$motivo);
                $movimientos=[];
                foreach ($ventas as $venta) {
                    // Una devolución de venta no habilita automáticamente el lote
                    // original ni presupone que el producto volvió apto para
                    // entregar. Se recibe en un lote NUEVO y BLOQUEADO, trazable
                    // por número y vencimiento, hasta que se evalúe su estado.
                    $q=$db->prepare("INSERT INTO medicamentos_lotes
                        (id_medicamento,numero_lote,fecha_ingreso,fecha_vencimiento,origen,
                         procedencia,cantidad_disponible,cantidad_cuarentena,estado,observaciones)
                        VALUES (?,?,?,?,'DEVOLUCION',?,0,0,'BLOQUEADO',?)");
                    $q->execute([(int)$venta['id_medicamento'],$venta['numero_lote'],date('Y-m-d'),$venta['fecha_vencimiento'],
                        'ANULACION VENTA #'.$idContable,'DEVOLUCIÓN DE VENTA. '.$motivo]);
                    $idLoteNuevo=(int)$db->lastInsertId();
                    $movimientos[]=self::inventory($db,$idLoteNuevo,'AJUSTE_ENTRADA',
                        (int)$venta['cantidad'],(int)$venta['cantidad'],0,null,null,null,null,$nuevoAsiento,$marca);
                    self::audit($db,$auth,'LOTE_DEVOLUCION_VENTA','medicamentos_lotes',$idLoteNuevo,null,
                        ['venta_contable'=>$idContable,'lote_original'=>$venta['id_lote'],'cantidad'=>$venta['cantidad'],'estado'=>'BLOQUEADO']);
                }
            }
            self::audit($db,$auth,'ANULAR_'.$etiqueta,'medicamentos_movimientos',$id,
                ['id_contable_original'=>$idContable],
                ['motivo'=>$motivo,'id_contable_compensatorio'=>$nuevoAsiento,'movimientos_inversos'=>$movimientos]);
            return ['operacion_anulada'=>$etiqueta,'movimientos_inversos'=>$movimientos,'id_contable_compensatorio'=>$nuevoAsiento];
        });
    }
    protected static function registrarSena(array $auth,array $b): array {
        return self::tx($auth,static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_prestamo']??null,'préstamo');$type=self::enum($b['tipo']??'',['DEVOLUCION_SENA','SENA_DONADA'],'movimiento de seña');$money=self::money($b['monto']??null);
            $s=$db->prepare('SELECT * FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');$s->execute([$id]);$p=$s->fetch();if(!$p||$p['estado']!=='ABIERTO')api_error('El préstamo no está abierto.');
            $s=$db->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='COBRO_SENA' THEN monto ELSE -monto END),0) saldo FROM medicamentos_prestamos_senas_movimientos WHERE id_prestamo=?");$s->execute([$id]);$saldo=(float)$s->fetchColumn();
            if((int)round((float)$money*100)>(int)round($saldo*100))api_error('El importe supera la seña pendiente de resolver.');
            $medio=null;$expense=null;
            if($type==='DEVOLUCION_SENA'){$medio=self::medio($db,$b['id_medio_pago']??null);$expense=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE SEÑAS','DEVOLUCIÓN DE SEÑA',$money,'Devolución seña préstamo #'.$id);}
            $db->prepare('INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_egreso_contable,observaciones) VALUES (?,?,?,?,?,?,?)')->execute([$id,date('Y-m-d H:i:s'),$type,$money,$medio,$expense,self::str($b,'observaciones',500)]);
            $mov=(int)$db->lastInsertId();self::audit($db,$auth,$type,'medicamentos_prestamos_senas_movimientos',$mov,null,['prestamo'=>$id,'monto'=>$money,'egreso'=>$expense]);return ['id_movimiento_sena'=>$mov];
        });
    }
}
