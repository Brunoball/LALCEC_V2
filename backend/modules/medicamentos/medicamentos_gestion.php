<?php
declare(strict_types=1);
trait MedicamentosGestion {
    use MedicamentosSoporte;

    // Contrato con MedicamentosConsultas (ambos traits se combinan en la clase
    // Medicamentos). Evita falsos errores de "método inexistente" en el IDE.
    abstract protected static function motivoNoAnulableSql(): string;

    protected static function guardarMedicamento(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=(int)($b['id_medicamento']??0);
            $fields=[self::req($b,'droga'),self::req($b,'nombre_comercial'),self::str($b,'laboratorio',160),self::req($b,'presentacion',100),self::req($b,'dosis',100),self::req($b,'unidad_stock',40),self::str($b,'observaciones',3000)];
            // La unidad de dosis es independiente de la unidad de stock. Los
            // registros antiguos sin unidad explícita conservan su dosis literal.
            $unidadDosis=self::textoLimitado($b,'unidad_dosis',20,'unidad de dosis');
            if($unidadDosis!==null && !preg_match('/^[\p{L}\p{N}µμ%\/.-]+$/u',$unidadDosis))
                api_error('La unidad de dosis sólo admite letras, números y símbolos de medida.','VALIDATION_ERROR',422);
            $cadenaFrio=$b['cadena_frio']??0;
            if(!in_array($cadenaFrio,[0,1,'0','1',false,true],true))api_error('Indicá si el medicamento requiere cadena de frío.','VALIDATION_ERROR',422);
            $cadenaFrio=(int)$cadenaFrio;
            // Un vencimiento por medicamento (no por lote). El cambio de fecha afecta
            // a todo el stock existente, y queda trazado por la auditoría general.
            // Los selectores editables provienen de la tabla centralizada.
            require_once __DIR__ . '/medicamentos_opciones.php';
            $vencimiento=isset($b['fecha_vencimiento']) && trim((string)$b['fecha_vencimiento'])!==''
                ? self::date($b['fecha_vencimiento'],'fecha de vencimiento') : null;
            if($id>0){
                $before=self::medicamentoBloqueado($db,$id,false);
                // Compatibilidad con clientes antiguos: si todavía no envían los
                // campos nuevos, una edición no debe borrar esos valores.
                if(!array_key_exists('unidad_dosis',$b))$unidadDosis=$before['unidad_dosis'];
                if(!array_key_exists('cadena_frio',$b))$cadenaFrio=(int)$before['cadena_frio'];
                // Las unidades de un préstamo o de un movimiento siguen refiriéndose a
                // esta presentación: no se reinterpretan retrospectivamente.
                $q=$db->prepare('SELECT COUNT(*) FROM medicamentos_movimientos WHERE id_medicamento=?');$q->execute([$id]);
                if((int)$q->fetchColumn()>0){
                    foreach(['droga'=>0,'presentacion'=>3,'dosis'=>4,'unidad_stock'=>5] as $campo=>$pos)
                        if((string)$before[$campo]!==$fields[$pos])api_error('No podés cambiar droga, presentación, dosis o unidad con movimientos históricos. Creá un medicamento nuevo para otra presentación.');
                    if((string)($before['unidad_dosis']??'')!==($unidadDosis??''))
                        api_error('No podés modificar la unidad de dosis de un medicamento con movimientos históricos.','VALIDATION_ERROR',422);
                }
                MedicamentosOpciones::validar($db,'PRESENTACION',$fields[3],(string)$before['presentacion']);
                MedicamentosOpciones::validar($db,'UNIDAD_STOCK',$fields[5],(string)$before['unidad_stock']);
                // Control optimista de la fecha única: el formulario informa qué fecha
                // tenía al abrirse. Si mientras tanto otra operación (p. ej. un ingreso)
                // la cambió, no se pisa: se conserva si el usuario no la tocó y, si la
                // tocó, se rechaza para que decida con el dato vigente.
                if(array_key_exists('fecha_vencimiento_original',$b)){
                    $orig=trim((string)($b['fecha_vencimiento_original']??''));
                    $orig=$orig===''?null:self::date($orig,'fecha de vencimiento original');
                    $vigente=$before['fecha_vencimiento']===null?null:(string)$before['fecha_vencimiento'];
                    if($orig!==$vigente){
                        if($vencimiento===$orig) $vencimiento=$vigente;
                        elseif($vencimiento!==$vigente)
                            api_error('La fecha de vencimiento fue modificada por otra operación mientras editabas (fecha vigente: '
                                .($vigente===null?'sin fecha':date('d/m/Y',strtotime($vigente))).'). Cerrá y volvé a abrir el medicamento.',
                                'VENCIMIENTO_CONCURRENTE',409);
                    }
                }
                if($vencimiento===null && (int)$before['stock_actual']>0)
                    api_error('Indicá la fecha de vencimiento del stock actual.');
                $db->prepare('UPDATE medicamentos SET droga=?,nombre_comercial=?,laboratorio=?,presentacion=?,dosis=?,unidad_stock=?,observaciones=?,fecha_vencimiento=?,unidad_dosis=?,cadena_frio=? WHERE id_medicamento=?')
                    ->execute([...$fields,$vencimiento,$unidadDosis,$cadenaFrio,$id]);
            } else {
                 $before=null;
                MedicamentosOpciones::validar($db,'PRESENTACION',$fields[3]);
                MedicamentosOpciones::validar($db,'UNIDAD_STOCK',$fields[5]);
                if((int)($b['ingreso_inicial']['cantidad']??0)>0 && $vencimiento===null)
                    api_error('Indicá la fecha de vencimiento del medicamento para cargar stock.');
                $db->prepare('INSERT INTO medicamentos (droga,nombre_comercial,laboratorio,presentacion,dosis,unidad_stock,observaciones,fecha_vencimiento,unidad_dosis,cadena_frio) VALUES (?,?,?,?,?,?,?,?,?,?)')
                    ->execute([...$fields,$vencimiento,$unidadDosis,$cadenaFrio]);
                $id=(int)$db->lastInsertId();
                // Es válido crearlo con stock 0; si se carga inicial es atómico.
                if(is_array($b['ingreso_inicial']??null) && (int)($b['ingreso_inicial']['cantidad']??0)>0)
                    self::registrarIngresoStock($db,$auth,$b['ingreso_inicial'],$id,true);
            }
            self::audit($db,$auth,$before?'EDITAR':'CREAR','medicamentos',$id,$before,[...$fields,'fecha_vencimiento'=>$vencimiento,'unidad_dosis'=>$unidadDosis,'cadena_frio'=>$cadenaFrio]);
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
                // Invariante: un medicamento dado de baja no conserva stock ni unidades
                // prestadas pendientes. Así no queda inventario "fantasma" que luego no
                // pueda descartarse (las salidas exigen medicamento activo).
                if((int)$before['activo']===1){
                    $stock=(int)$before['stock_actual'];
                    if($stock>0)
                        api_error('No podés dar de baja «'.$before['nombre_comercial'].'» porque tiene '.$stock.' '.$before['unidad_stock']
                            .' en stock. Registrá primero el descarte o el ajuste en Editar > Stock > Restar stock.','BAJA_CON_STOCK',422);
                    $q=$db->prepare("SELECT COALESCE(SUM(d.cantidad_entregada-COALESCE((SELECT SUM(r.cantidad)
                            FROM medicamentos_prestamos_devoluciones r WHERE r.id_detalle_prestamo=d.id_detalle_prestamo),0)),0)
                        FROM medicamentos_prestamos_detalle d
                        JOIN medicamentos_prestamos p ON p.id_prestamo=d.id_prestamo AND p.estado='ABIERTO'
                        WHERE d.id_medicamento=?");
                    $q->execute([$id]);$pendientes=(int)$q->fetchColumn();
                    if($pendientes>0)
                        api_error('No podés dar de baja «'.$before['nombre_comercial'].'» porque tiene '.$pendientes
                            .' unidades prestadas sin devolver en préstamos abiertos. Registrá la devolución o finalizá esos préstamos primero.','BAJA_CON_PRESTAMOS',422);
                }
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
        // Orígenes del sistema (con reglas propias) u origen adicional del catálogo
        // configurable (Configuración > Medicamentos > Orígenes de ingreso), que se
        // registra como entrada sin costo y sin asiento contable.
        $origen=self::origenIngreso($db,$b['origen']??'');
        if($origen==='INICIAL'&&!$primero)api_error('El stock inicial se carga al crear el medicamento.');
        $cantidad=self::qty($b['cantidad']??null);
        // Cuando llega mercadería nueva puede actualizarse la fecha única del
        // medicamento, sin crear lotes ni perder el historial de entradas.
        $vencimientoPrevio=$m['fecha_vencimiento']===null?null:(string)$m['fecha_vencimiento'];
        $vencimiento=$vencimientoPrevio;
        if(array_key_exists('fecha_vencimiento',$b)){
            $vencimiento=trim((string)$b['fecha_vencimiento'])!==''
                ? self::date($b['fecha_vencimiento'],'fecha de vencimiento') : null;
        }
        if($vencimiento===null)api_error('Indicá la fecha de vencimiento antes de ingresar stock.');
        $fecha=isset($b['fecha_ingreso'])&&$b['fecha_ingreso']!==''?self::date($b['fecha_ingreso'],'fecha de ingreso'):date('Y-m-d');
        if($fecha>date('Y-m-d'))api_error('La fecha de ingreso no puede ser futura.');
        $costo=$origen==='COMPRA'?self::money($b['costo_unitario']??null):null;
        // 160 = largo de contable_egresos.proveedor (la procedencia de una compra se copia allí).
        $proveedor=self::textoLimitado($b,'procedencia',160,'donante / proveedor');
        // Trello: el donante se identifica con nombre y apellido (sin vincularlo a
        // socios) y el proveedor con sus datos. Ambos son obligatorios.
        if(in_array($origen,['DONACION','COMPRA'],true) && ($proveedor===null || self::largo($proveedor)<3))
            api_error($origen==='DONACION'
                ? 'Ingresá nombre y apellido del donante (mínimo 3 caracteres).'
                : 'Ingresá los datos del proveedor (mínimo 3 caracteres).','PROCEDENCIA_REQUERIDA',422);
        $egreso=null;
        if($origen==='COMPRA'){
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $total=number_format($cantidad*(float)$costo,2,'.','');
            if((float)$total>9999999999.99)api_error('Importe de compra excesivo.');
            $detalle='Compra de '.$cantidad.' '.$m['unidad_stock'].' de '.$m['nombre_comercial'];
            $egreso=self::egresoContable($db,$fecha,$medio,'COMPRA DE MEDICAMENTOS','COMPRA DE MEDICAMENTOS',$total,$detalle,$proveedor);
        }
        $tipo=['COMPRA'=>'INGRESO_COMPRA','DONACION'=>'INGRESO_DONACION','INICIAL'=>'INGRESO_INICIAL','AJUSTE'=>'AJUSTE_ENTRADA'][$origen] ?? 'INGRESO_OTRO';
        // La fecha declarada queda en el propio movimiento (trazabilidad) y se
        // registran el vencimiento previo y el aplicado para poder revertirlo.
        $mov=self::inventory($db,$id,$tipo,$cantidad,$cantidad,null,null,null,null,$egreso,
            self::str($b,'observaciones',500),$origen,$proveedor,$costo,null,$fecha,$vencimientoPrevio,$vencimiento);
        // "Último ingreso" nunca retrocede por una carga con fecha anterior.
        // ultimo_origen se asigna primero porque MySQL evalúa el SET de izquierda a derecha.
        $db->prepare('UPDATE medicamentos SET
                ultimo_origen=IF(ultimo_ingreso IS NULL OR ultimo_ingreso<=?,?,ultimo_origen),
                ultimo_ingreso=IF(ultimo_ingreso IS NULL OR ultimo_ingreso<=?,?,ultimo_ingreso),
                fecha_vencimiento=? WHERE id_medicamento=?')
            ->execute([$fecha,$origen,$fecha,$fecha,$vencimiento,$id]);
        self::audit($db,$auth,'INGRESO_STOCK','medicamentos_movimientos',$mov,['fecha_vencimiento'=>$vencimientoPrevio],
            ['medicamento'=>$id,'origen'=>$origen,'cantidad'=>$cantidad,'egreso'=>$egreso,'fecha_ingreso'=>$fecha,'fecha_vencimiento'=>$vencimiento]);
        return ['id_movimiento'=>$mov];
    }

    /** Código de origen del sistema o nombre de un origen activo del catálogo. */
    private static function origenIngreso(PDO $db,mixed $valor): string {
        $origen=clean_text(is_scalar($valor)?(string)$valor:'',100,true);
        if(in_array($origen,MedicamentosOpciones::CODIGOS_ORIGEN_SISTEMA,true)){
            MedicamentosOpciones::validarOrigenSistema($db,$origen);
            return $origen;
        }
        if($origen==='') api_error('Valor inválido para origen.');
        MedicamentosOpciones::validar($db,'ORIGEN_INGRESO',$origen);
        return $origen;
    }

    /**
     * Control de vencimiento de entregas, ventas y préstamos.
     * Declarado en Gestión para que Intelephense resuelva ambas llamadas
     * sin depender del análisis de métodos importados desde otro trait.
     */
    private static function verificarVigenciaParaEntrega(array $med): void {
        $v=(string)($med['fecha_vencimiento']??'');
        $nombre=trim((string)($med['nombre_comercial']??'')) ?: 'seleccionado';
        $sector=MedicamentosOpciones::esPresentacionDolor((string)($med['presentacion']??''))
            ? 'Tratamiento del dolor' : 'Medicamentos';
        $ruta='Banco de Drogas > '.$sector.' > Stock';
        if($v==='')api_error('El medicamento «'.$nombre.'» no tiene fecha de vencimiento. Corregila en '.$ruta.' > Editar > Datos antes de entregarlo, venderlo o prestarlo.','VENCIMIENTO_FALTANTE',422);
        if($v<date('Y-m-d'))
            api_error('El medicamento «'.$nombre.'» venció el '.date('d/m/Y',strtotime($v)).'. No se puede entregar, vender ni prestar. Revisá su stock en '.$ruta.'.','MEDICAMENTO_VENCIDO',422);
    }

    protected static function salidaStock(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_medicamento']??null,'medicamento');
            $m=self::medicamentoBloqueado($db,$id);
            // Las entregas de Tratamiento del dolor siempre descuentan stock del
            // mismo sector y guardan el receptor manual, sin tocar el padrón.
            $entregaDolor=($b['sector_destino']??null)==='DOLOR';
            if(isset($b['sector_destino']) && !$entregaDolor)
                api_error('Sector de entrega inválido.','VALIDATION_ERROR',422);
            if($entregaDolor && !MedicamentosOpciones::esPresentacionDolor((string)$m['presentacion']))
                api_error('Esta presentación no corresponde a Tratamiento del dolor.','VALIDATION_ERROR',422);
            // Los motivos propios se registran como ajuste negativo sin asiento de
            // venta, guardando el nombre histórico en `origen`. Así no se altera el
            // ENUM de movimientos ni las reglas contables preexistentes.
            require_once __DIR__ . '/medicamentos_opciones.php';
            $motivo=clean_text(is_scalar($b['tipo']??null)?(string)$b['tipo']:'',100,true);
            if(in_array($motivo,MedicamentosOpciones::CODIGOS_SALIDA_SISTEMA,true)) {
                MedicamentosOpciones::validarSalidaSistema($db,$motivo);
                $tipo=$motivo;
                $motivoPersonalizado=null;
            } else {
                MedicamentosOpciones::validar($db,'SALIDA_STOCK',$motivo);
                $tipo='AJUSTE_SALIDA';
                $motivoPersonalizado=$motivo;
            }
            // Las entregas gratuitas se registran desde Entregas, con varios tratamientos.
            // Desde Restar stock solo quedan el descarte y el ajuste por error de carga.
            if(($entregaDolor || MedicamentosOpciones::esPresentacionDolor((string)$m['presentacion']))
                && in_array($tipo,['ENTREGA_DONACION','SALIDA_VENTA'],true))
                api_error('Las entregas de Tratamiento del dolor se registran en Tratamiento del dolor > Entregas, sin cargo.','ENTREGA_DOLOR_CENTRALIZADA',422);
            if(in_array($tipo,['ENTREGA_DONACION','SALIDA_VENTA'],true)) self::verificarVigenciaParaEntrega($m);
            // "Descarte por vencimiento" solo aplica a stock vencido (o sin fecha,
            // que no se puede entregar). Para corregir errores de carga existe el ajuste.
            $vence=(string)($m['fecha_vencimiento']??'');
            if($tipo==='BAJA_DESCARTE' && $vence!=='' && $vence>=date('Y-m-d'))
                api_error('El descarte por vencimiento solo se registra con el medicamento vencido (vence el '
                    .date('d/m/Y',strtotime($vence)).'). Para corregir un error de carga usá «Ajuste por error de carga».','DESCARTE_NO_VENCIDO',422);
            $nota=self::str($b,'detalle',500);
            if($tipo==='AJUSTE_SALIDA' && $motivoPersonalizado===null && ($nota===null || self::largo($nota)<10))
                api_error('Explicá el motivo del ajuste por error de carga (mínimo 10 caracteres).','VALIDATION_ERROR',422);
            // Toda entrega sin cargo (Medicamentos o Tratamiento del dolor) registra
            // quién recibe, en texto libre y sin vincularlo al padrón de socios.
            $receptor=$tipo==='ENTREGA_DONACION' ? self::textoLimitado($b,'receptor',160,'persona que recibe') : null;
            if($tipo==='ENTREGA_DONACION' && ($receptor===null || self::largo($receptor)<3))
                api_error('Ingresá nombre y apellido de quien recibe (mínimo 3 caracteres).','VALIDATION_ERROR',422);
            $cantidad=self::qty($b['cantidad']??null);
            $ingreso=null;
            if($tipo==='SALIDA_VENTA'){
                $total=self::money($b['importe']??null);
                $medio=self::medio($db,$b['id_medio_pago']??null);
                $ingreso=self::ingresoContable($db,date('Y-m-d'),$medio,'VENTA DE MEDICAMENTOS','VENTA DE MEDICAMENTOS',$total,'Venta de '.$cantidad.' '.$m['unidad_stock'].' de '.$m['nombre_comercial']);
            }
            $mov=self::inventory($db,$id,$tipo,$cantidad,-$cantidad,null,null,null,$ingreso,null,$nota,$motivoPersonalizado,$receptor);
            self::audit($db,$auth,'EGRESO_STOCK','medicamentos_movimientos',$mov,null,['medicamento'=>$id,'tipo'=>$tipo,'motivo_salida'=>$motivo,'cantidad'=>$cantidad,'ingreso'=>$ingreso]);
            return ['id_movimiento'=>$mov];
        },$auth,$b,'salidaStock');
    }

    protected static function crearPrestamo(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            // El paciente/receptor no necesita pertenecer al padrón de socios.
            // Se admite id_socio solo para compatibilidad con integraciones y
            // préstamos históricos que siguen enviando ese identificador.
            $socio=isset($b['id_socio']) && (string)$b['id_socio']!==''
                ? positive_id($b['id_socio'],'socio') : null;
            $nombre=self::textoLimitado($b,'nombre_receptor',160,'nombre de quien retira');
            $apellido=self::textoLimitado($b,'apellido_receptor',160,'apellido de quien retira');
            if($socio===null && (!$nombre || !$apellido || self::largo($nombre)<2 || self::largo($apellido)<2))
                api_error('Ingresá nombre y apellido de la persona que retira el medicamento (mínimo 2 caracteres por campo).','VALIDATION_ERROR',422);
            if($socio!==null && ($nombre!==null || $apellido!==null))
                api_error('No combines un socio vinculado con nombre y apellido manuales.','VALIDATION_ERROR',422);
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
            if($socio!==null){
                $q=$db->prepare("SELECT estado FROM socios WHERE id_socio=? AND NOT EXISTS (SELECT 1 FROM socios_eliminados x WHERE x.id_socio=socios.id_socio) FOR UPDATE");
                $q->execute([$socio]);if($q->fetchColumn()!=='ACTIVO')api_error('Elegí un socio activo.');
            }
            foreach($parsed as $id=>$cantidad){
                $m=self::medicamentoBloqueado($db,$id);
                if(MedicamentosOpciones::esPresentacionDolor((string)$m['presentacion']))
                    api_error('Tratamiento del dolor registra Entregas, no Préstamos.','VALIDATION_ERROR',422);
                self::verificarVigenciaParaEntrega($m);
                if((int)$m['stock_actual']<$cantidad)api_error('Stock insuficiente de '.$m['nombre_comercial'].'.');
            }
            $vence=($b['fecha_devolucion_prevista']??'')!==''?self::date($b['fecha_devolucion_prevista'],'fecha prevista'):null;
            if($vence!==null && $vence<date('Y-m-d'))api_error('La devolución prevista no puede ser pasada.');
            // Trello: paciente (nombre y DNI) y persona que retira (DNI y celular)
            // se cargan a mano, sin vincularlos al padrón. Son obligatorios en los
            // préstamos manuales; los préstamos con id_socio (integraciones e
            // históricos) los admiten de forma opcional.
            $columnasNuevas=self::columnasPacienteDisponibles($db);
            $manual=$socio===null;
            $pacienteEnviado=false;
            foreach(['paciente_nombre','paciente_dni','dni_receptor','celular_receptor'] as $campo)
                if(trim(is_scalar($b[$campo]??null)?(string)$b[$campo]:'')!=='')$pacienteEnviado=true;
            if(!$columnasNuevas && ($manual || $pacienteEnviado))
                api_error('Falta ejecutar la migración de préstamos (datos del paciente, DNI y celular). Ejecutá el SQL incluido en el ZIP.','MIGRACION_PENDIENTE',503);
            $paciente=[];
            if($columnasNuevas){
                $pacienteNombre=self::textoLimitado($b,'paciente_nombre',160,'nombre y apellido del paciente');
                if($manual && ($pacienteNombre===null || self::largo($pacienteNombre)<3))
                    api_error('Ingresá nombre y apellido del paciente (mínimo 3 caracteres).','VALIDATION_ERROR',422,['campo'=>'paciente_nombre']);
                $paciente=[
                    'paciente_nombre'=>$pacienteNombre,
                    'paciente_dni'=>self::documentoTexto($b,'paciente_dni','DNI del paciente',$manual),
                    'dni_receptor'=>self::documentoTexto($b,'dni_receptor','DNI de quien retira',$manual),
                    'celular_receptor'=>self::celularTexto($b,'celular_receptor','celular de contacto',$manual),
                ];
            }
            $columnas=['id_socio','nombre_receptor','apellido_receptor','fecha_entrega','fecha_devolucion_prevista','observaciones',...array_keys($paciente)];
            $db->prepare('INSERT INTO medicamentos_prestamos ('.implode(',',$columnas).') VALUES ('.implode(',',array_fill(0,count($columnas),'?')).')')
                ->execute([$socio,$nombre,$apellido,date('Y-m-d H:i:s'),$vence,self::str($b,'observaciones',3000),...array_values($paciente)]);
            $prestamo=(int)$db->lastInsertId();
            foreach($parsed as $id=>$cantidad){
                $db->prepare('INSERT INTO medicamentos_prestamos_detalle (id_prestamo,id_medicamento,cantidad_entregada) VALUES (?,?,?)')->execute([$prestamo,$id,$cantidad]);
                $detalle=(int)$db->lastInsertId();
                self::inventory($db,$id,'ENTREGA_PRESTAMO',$cantidad,-$cantidad,$detalle,null,$socio);
            }
            // Un campo de seña vacío equivale a "sin seña".
            $senaRecibida=$b['sena']??'0';
            if($senaRecibida===null || (is_string($senaRecibida) && trim($senaRecibida)==='')) $senaRecibida='0';
            $sena=self::money($senaRecibida,true);
            if((float)$sena>0){
                $medio=self::medioEfectivo($db,$b['id_medio_pago']??null);
                $titular=($nombre && $apellido) ? trim($nombre.' '.$apellido) : self::nombreSocioPrestamo($db,$socio);
                $ingreso=self::ingresoContable($db,date('Y-m-d'),$medio,'SEÑAS DE MEDICAMENTOS','COBRO DE SEÑA',$sena,'Seña préstamo medicamentos #'.$prestamo,$titular);
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_ingreso_contable) VALUES (?,?,'COBRO_SENA',?,?,?)")
                    ->execute([$prestamo,date('Y-m-d H:i:s'),$sena,$medio,$ingreso]);
            }
            self::audit($db,$auth,'CREAR_PRESTAMO','medicamentos_prestamos',$prestamo,null,['socio'=>$socio,'receptor'=>trim(($nombre??'').' '.($apellido??'')),'items'=>$parsed,'sena'=>$sena]+$paciente);
            return ['id_prestamo'=>$prestamo];
        },$auth,$b,'crearPrestamo');
    }

    /**
     * Devolución de medicamentos prestados.
     *
     * Formatos admitidos por la misma acción `medicamentos_devolver`:
     * - Individual (histórico): {id_detalle_prestamo, cantidad, observaciones}.
     * - Múltiple: {id_prestamo, items:[{id_detalle_prestamo,cantidad},...], observaciones}.
     *
     * Ambos comparten una única transacción: se valida TODO antes de escribir y,
     * si un renglón es inválido, no se registra ninguno. El préstamo se bloquea
     * primero (FOR UPDATE), luego sus renglones y por último los medicamentos en
     * orden estable; así dos devoluciones simultáneas del mismo préstamo se
     * serializan y nunca superan las unidades pendientes.
     */
    protected static function devolverMedicamento(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $multiple=array_key_exists('items',$b);
            if($multiple){
                $prestamo=positive_id($b['id_prestamo']??null,'préstamo');
                $items=$b['items'];
                if(!is_array($items) || !array_is_list($items) || count($items)<1)
                    api_error('Seleccioná al menos un medicamento para devolver.','DEVOLUCION_SIN_ITEMS',422);
                if(count($items)>30)api_error('Una devolución admite hasta 30 medicamentos.','VALIDATION_ERROR',422);
            } else {
                $detalleUnico=positive_id($b['id_detalle_prestamo']??null,'detalle de préstamo');
                $q=$db->prepare('SELECT id_prestamo FROM medicamentos_prestamos_detalle WHERE id_detalle_prestamo=?');
                $q->execute([$detalleUnico]);$prestamo=(int)$q->fetchColumn();if(!$prestamo)api_error('Detalle inexistente.');
                $items=[['id_detalle_prestamo'=>$detalleUnico,'cantidad'=>$b['cantidad']??null]];
            }
            // Validación sintáctica completa antes de tocar la base.
            $pedidos=[];
            foreach($items as $i=>$item){
                if(!is_array($item))api_error('Renglón de devolución inválido.','VALIDATION_ERROR',422);
                $detalle=positive_id($item['id_detalle_prestamo']??null,'detalle de préstamo');
                if(isset($pedidos[$detalle]))
                    api_error('No repitas el mismo medicamento en la devolución.','DEVOLUCION_DUPLICADA',422);
                $pedidos[$detalle]=self::qty($item['cantidad']??null);
            }
            // 450: deja lugar al prefijo "Devolución de préstamo · " en el detalle del movimiento (500).
            $nota=self::textoLimitado($b,'observaciones',450,'observaciones');

            $q=$db->prepare('SELECT estado,id_socio FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $q->execute([$prestamo]);$p=$q->fetch(PDO::FETCH_ASSOC);
            if(!$p)api_error('Préstamo no encontrado.','NOT_FOUND',404);
            if($p['estado']!=='ABIERTO')api_error('Préstamo no abierto.','PRESTAMO_NO_ABIERTO',422);

            $ids=array_keys($pedidos);sort($ids,SORT_NUMERIC);
            $in=implode(',',array_fill(0,count($ids),'?'));
            $q=$db->prepare("SELECT d.id_detalle_prestamo,d.id_prestamo,d.id_medicamento,d.cantidad_entregada,m.nombre_comercial
                FROM medicamentos_prestamos_detalle d JOIN medicamentos m ON m.id_medicamento=d.id_medicamento
                WHERE d.id_detalle_prestamo IN ($in) ORDER BY d.id_detalle_prestamo FOR UPDATE");
            $q->execute($ids);
            $renglones=[];
            foreach($q->fetchAll(PDO::FETCH_ASSOC) as $row)$renglones[(int)$row['id_detalle_prestamo']]=$row;
            foreach($ids as $detalle){
                if(!isset($renglones[$detalle]))api_error('Detalle inexistente.','NOT_FOUND',404);
                // Impide devolver renglones de otro préstamo manipulando la API.
                if((int)$renglones[$detalle]['id_prestamo']!==$prestamo)
                    api_error('El medicamento seleccionado no pertenece a este préstamo.','DETALLE_AJENO',422);
            }
            // Un préstamo abierto debe admitir devolución aun si el medicamento
            // fue dado de baja después de prestarlo. El stock vuelve al mismo
            // registro inactivo y seguirá bloqueado para nuevas salidas.
            self::bloquearMedicamentos($db,array_map(static fn($r)=>(int)$r['id_medicamento'],$renglones));

            $q=$db->prepare('SELECT COALESCE(SUM(cantidad),0) FROM medicamentos_prestamos_devoluciones WHERE id_detalle_prestamo=?');
            foreach($ids as $detalle){
                $q->execute([$detalle]);$recibido=(int)$q->fetchColumn();$q->closeCursor();
                $pendiente=(int)$renglones[$detalle]['cantidad_entregada']-$recibido;
                if($pedidos[$detalle]>$pendiente)
                    api_error($multiple
                        ? 'La devolución de «'.$renglones[$detalle]['nombre_comercial'].'» supera las unidades pendientes ('.max(0,$pendiente).').'
                        : 'La devolución supera las unidades pendientes.','DEVOLUCION_EXCEDIDA',422,['id_detalle_prestamo'=>$detalle,'pendiente'=>max(0,$pendiente)]);
            }

            $socio=$p['id_socio']===null?null:(int)$p['id_socio'];
            $ahora=date('Y-m-d H:i:s');
            $insert=$db->prepare('INSERT INTO medicamentos_prestamos_devoluciones (id_detalle_prestamo,fecha_recepcion,cantidad,estado,observaciones) VALUES (?,?,?,\'APROBADA\',?)');
            $registradas=[];
            // Se conserva el orden en que el operador cargó los renglones.
            foreach($pedidos as $detalle=>$cantidad){
                $insert->execute([$detalle,$ahora,$cantidad,$nota]);
                $devolucion=(int)$db->lastInsertId();
                self::inventory($db,(int)$renglones[$detalle]['id_medicamento'],'DEVOLUCION_LIBERADA',$cantidad,$cantidad,$detalle,$devolucion,$socio,null,null,'Devolución de préstamo'.($nota?' · '.$nota:''));
                self::audit($db,$auth,'REGISTRAR_DEVOLUCION','medicamentos_prestamos_devoluciones',$devolucion,null,
                    ['prestamo'=>$prestamo,'detalle'=>$detalle,'medicamento'=>(int)$renglones[$detalle]['id_medicamento'],'cantidad'=>$cantidad,'multiple'=>$multiple]);
                $registradas[]=['id_devolucion'=>$devolucion,'id_detalle_prestamo'=>$detalle,'cantidad'=>$cantidad];
            }
            if(!$multiple)return ['id_devolucion'=>$registradas[0]['id_devolucion']];
            return ['id_prestamo'=>$prestamo,'id_devoluciones'=>array_column($registradas,'id_devolucion'),
                'devoluciones'=>$registradas,'unidades_devueltas'=>array_sum($pedidos)];
        },$auth,$b,'devolverMedicamento');
    }

    /** Cierre: lo no devuelto ya fue descontado al entregar. La seña pendiente se dona sin doble cobro. */
    /**
     * Único flujo de cierre (Trello: "quitaría lo del candado"). La seña pendiente se
     * resuelve en la misma transacción que el cierre:
     * - resolucion_sena=EFECTIVO: reintegra TODO el saldo en efectivo (egreso contable).
     * - resolucion_sena=DONACION (predeterminado, compatible con el contrato anterior):
     *   conserva el saldo como donación, sin egreso de dinero.
     * Los reintegros parciales se registran con medicamentos_sena y el préstamo sigue
     * abierto: nunca se cierra dejando dinero sin resolver. Cerrar no devuelve stock:
     * las unidades no devueltas quedan registradas en el detalle.
     */
    protected static function cerrarPrestamo(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_prestamo']??null,'préstamo');
            $resolucion=self::enum($b['resolucion_sena']??'DONACION',['DONACION','EFECTIVO'],'destino de la seña');
            $q=$db->prepare('SELECT * FROM medicamentos_prestamos WHERE id_prestamo=? FOR UPDATE');
            $q->execute([$id]);$p=$q->fetch(PDO::FETCH_ASSOC);
            if(!$p || $p['estado']!=='ABIERTO')api_error('El préstamo no está abierto.');
            $q=$db->prepare('SELECT d.cantidad_entregada,COALESCE(SUM(r.cantidad),0) devuelto FROM medicamentos_prestamos_detalle d LEFT JOIN medicamentos_prestamos_devoluciones r ON r.id_detalle_prestamo=d.id_detalle_prestamo WHERE d.id_prestamo=? GROUP BY d.id_detalle_prestamo');
            $q->execute([$id]);$faltantes=0;
            foreach($q->fetchAll() as $r){$faltante=(int)$r['cantidad_entregada']-(int)$r['devuelto'];if($faltante<0)api_error('Devolución inválida.');$faltantes+=$faltante;}
            $q=$db->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='COBRO_SENA' THEN monto ELSE -monto END),0) FROM medicamentos_prestamos_senas_movimientos WHERE id_prestamo=?");
            $q->execute([$id]);$centavos=(int)round((float)$q->fetchColumn()*100);
            if($centavos<0)api_error('Saldo de seña inválido.');
            $saldo=number_format($centavos/100,2,'.','');
            // El operador confirma el importe que vio; si cambió en el medio, no se cierra.
            if(array_key_exists('monto_reintegro',$b) && $resolucion==='EFECTIVO'
                && (int)round((float)self::money($b['monto_reintegro'],true)*100)!==$centavos)
                api_error('La seña pendiente cambió. Volvé a abrir el préstamo.','SENA_DESACTUALIZADA',409);
            $donacion='0.00';$reintegro='0.00';
            if($centavos>0 && $resolucion==='EFECTIVO'){
                $medio=self::medioEfectivo($db,$b['id_medio_pago']??null);
                $nombre=($p['nombre_receptor'] && $p['apellido_receptor'])
                    ? trim($p['nombre_receptor'].' '.$p['apellido_receptor'])
                    : self::nombreSocioPrestamo($db,(int)$p['id_socio']);
                $egreso=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE SEÑAS','DEVOLUCIÓN DE SEÑA',$saldo,'Devolución seña préstamo #'.$id,$nombre);
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_egreso_contable,observaciones) VALUES (?,?,'DEVOLUCION_SENA',?,?,?,?)")
                    ->execute([$id,date('Y-m-d H:i:s'),$saldo,$medio,$egreso,self::str($b,'observaciones',500) ?? 'CIERRE DEFINITIVO: SEÑA REINTEGRADA EN EFECTIVO']);
                self::audit($db,$auth,'DEVOLUCION_SENA','medicamentos_prestamos_senas_movimientos',(int)$db->lastInsertId(),null,['prestamo'=>$id,'monto'=>$saldo,'egreso'=>$egreso,'cierre'=>true]);
                $reintegro=$saldo;
            } elseif($centavos>0){
                $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,observaciones) VALUES (?,?,'SENA_DONADA',?,'CIERRE DEFINITIVO: SEÑA CONSERVADA COMO DONACIÓN')")->execute([$id,date('Y-m-d H:i:s'),$saldo]);
                self::audit($db,$auth,'SENA_DONADA','medicamentos_prestamos_senas_movimientos',(int)$db->lastInsertId(),null,['prestamo'=>$id,'monto'=>$saldo]);
                $donacion=$saldo;
            }
            $db->prepare("UPDATE medicamentos_prestamos SET estado='CERRADO',fecha_cierre=? WHERE id_prestamo=?")->execute([date('Y-m-d H:i:s'),$id]);
            self::audit($db,$auth,'CERRAR_PRESTAMO','medicamentos_prestamos',$id,['estado'=>'ABIERTO'],['estado'=>'CERRADO','unidades_sin_devolver'=>$faltantes,'sena_donada'=>$donacion,'sena_reintegrada'=>$reintegro]);
            return ['estado'=>'CERRADO','unidades_sin_devolver'=>$faltantes,'sena_donada'=>$donacion,'sena_reintegrada'=>$reintegro];
        },$auth,$b,'cerrarPrestamo');
    }

    /** Alta o corrección de una entrega gratuita. El historial de stock es inmutable. */
    protected static function entregarDolor(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            if(!self::entregasCobradasDisponibles($db) || !self::entregasGratuitasDisponibles($db))
                api_error('Ejecutá la migración de Entregas gratuitas antes de continuar.','MIGRACION_PENDIENTE',503);
            if(array_key_exists('importe',$b) || array_key_exists('id_medio_pago',$b))
                api_error('Las entregas son gratuitas: no se admite importe ni medio de pago.','ENTREGA_SIN_CARGO',422);
            $paciente=self::textoLimitado($b,'paciente_nombre',160,'nombre y apellido del paciente');
            if($paciente===null || self::largo($paciente)<3)
                api_error('Ingresá nombre y apellido del paciente (mínimo 3 caracteres).','VALIDATION_ERROR',422,['campo'=>'paciente_nombre']);
            $pacienteDni=self::documentoTexto($b,'paciente_dni','DNI del paciente',true);
            $nombre=self::textoLimitado($b,'nombre_receptor',160,'nombre de quien retira');
            $apellido=self::textoLimitado($b,'apellido_receptor',160,'apellido de quien retira');
            if(!$nombre || !$apellido || self::largo($nombre)<2 || self::largo($apellido)<2)
                api_error('Ingresá nombre y apellido de la persona que retira (mínimo 2 caracteres por campo).','VALIDATION_ERROR',422);
            $dni=self::documentoTexto($b,'dni_receptor','DNI de quien retira',true);
            $celular=self::celularTexto($b,'celular_receptor','celular de contacto',true);
            $items=$b['items']??null;
            if(!is_array($items) || !array_is_list($items) || count($items)<1 || count($items)>30)
                api_error('Agregá entre 1 y 30 tratamientos.','VALIDATION_ERROR',422);
            $pedidos=[];
            foreach($items as $item){
                if(!is_array($item))api_error('Tratamiento inválido.','VALIDATION_ERROR',422);
                $id=positive_id($item['id_medicamento']??null,'tratamiento');
                if(isset($pedidos[$id]))api_error('No repitas el mismo tratamiento en la entrega.','ENTREGA_DUPLICADA',422);
                $pedidos[$id]=self::qty($item['cantidad']??null);
            }
            $nota=self::textoLimitado($b,'observaciones',450,'observaciones');
            $anterior=null;$previos=[];$motivo=null;$entrega=null;
            if(array_key_exists('id_entrega',$b)){
                $entrega=positive_id($b['id_entrega'],'entrega');
                $revision=positive_id($b['revision']??null,'revisión');
                $q=$db->prepare('SELECT * FROM medicamentos_entregas WHERE id_entrega=? FOR UPDATE');
                $q->execute([$entrega]);$anterior=$q->fetch(PDO::FETCH_ASSOC);
                if(!$anterior)api_error('Entrega no encontrada.','NOT_FOUND',404);
                if(e2e_request_enabled() && !e2e_marker_text($anterior['nombre_receptor']))e2e_scope_error('medicamentos_entregar','La entrega no tiene receptor E2E.');
                if((float)$anterior['importe']!==0.0 || $anterior['id_ingreso_contable']!==null || $anterior['id_medio_pago']!==null)
                    api_error('Las entregas históricas cobradas no se pueden corregir desde este flujo.','ENTREGA_HISTORICA',409);
                if((int)$anterior['revision']!==$revision)api_error('La entrega cambió. Cerrá y volvé a abrir para corregirla.','ENTREGA_DESACTUALIZADA',409);
                $motivo=self::textoLimitado($b,'motivo_correccion',300,'motivo de corrección');
                if(!$motivo || self::largo($motivo)<10)api_error('Ingresá un motivo de corrección de al menos 10 caracteres.','VALIDATION_ERROR',422);
                $q=$db->prepare('SELECT id_medicamento,variacion_disponible FROM medicamentos_movimientos WHERE id_entrega=? ORDER BY id_movimiento FOR UPDATE');
                $q->execute([$entrega]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){
                    $mid=(int)$r['id_medicamento'];
                    $previos[$mid]=($previos[$mid]??0)-(int)$r['variacion_disponible'];
                    if(e2e_request_enabled() && !e2e_medicamento($db,$mid))e2e_scope_error('medicamentos_entregar','La entrega incluye stock real.');
                }
                foreach($previos as $cantidad)if($cantidad<0)api_error('La entrega tiene inconsistencias de stock.','ENTREGA_INCONSISTENTE',409);
                $previos=array_filter($previos,static fn($cantidad)=>$cantidad>0);
                if(!$previos)api_error('No se encontraron tratamientos de la entrega.','ENTREGA_INCONSISTENTE',409);
            }
            $ids=array_unique(array_merge(array_keys($previos),array_keys($pedidos)));
            self::bloquearMedicamentos($db,$ids);
            $deltas=[];
            foreach($ids as $id){
                $delta=($previos[$id]??0)-($pedidos[$id]??0);
                $m=self::medicamentoBloqueado($db,$id,false);
                if($delta!==0 && ((int)$m['activo']!==1 || !MedicamentosOpciones::esPresentacionDolor((string)$m['presentacion'])))
                    api_error('«'.$m['nombre_comercial'].'» no corresponde a Tratamiento del dolor activo.','VALIDATION_ERROR',422);
                if($delta<0){
                    self::verificarVigenciaParaEntrega($m);
                    if((int)$m['stock_actual']<-$delta)api_error('Stock insuficiente de '.$m['nombre_comercial'].'.','STOCK_INSUFICIENTE',422);
                }
                if($delta>0){
                    if(!in_array($b['stock_confirmado']??null,[true,1,'1'],true))api_error('Confirmá que las unidades que se reincorporan nunca salieron del stock físico.','CORRECCION_STOCK_CONFIRMACION',422);
                    // No reincorporar automáticamente medicamentos vencidos o sin fecha.
                    self::verificarVigenciaParaEntrega($m);
                    if((int)$m['stock_actual']>4294967295-$delta)api_error('La corrección supera el límite de stock.','STOCK_LIMITE',422);
                }
                if($delta!==0)$deltas[$id]=$delta;
            }
            $receptor=trim($nombre.' '.$apellido);
            if($anterior===null){
                $db->prepare('INSERT INTO medicamentos_entregas (fecha,paciente_nombre,paciente_dni,nombre_receptor,apellido_receptor,dni_receptor,celular_receptor,importe,id_medio_pago,observaciones) VALUES (?,?,?,?,?,?,?,0,NULL,?)')
                    ->execute([date('Y-m-d H:i:s'),$paciente,$pacienteDni,$nombre,$apellido,$dni,$celular,$nota]);
                $entrega=(int)$db->lastInsertId();$revision=1;
            }else{
                $db->prepare('UPDATE medicamentos_entregas SET paciente_nombre=?,paciente_dni=?,nombre_receptor=?,apellido_receptor=?,dni_receptor=?,celular_receptor=?,observaciones=?,revision=revision+1 WHERE id_entrega=?')
                    ->execute([$paciente,$pacienteDni,$nombre,$apellido,$dni,$celular,$nota,$entrega]);
                $revision++;
            }
            $marcar=$db->prepare('UPDATE medicamentos_movimientos SET id_entrega=? WHERE id_movimiento=?');
            $movimientos=[];
            foreach($deltas as $id=>$delta){
                $tipo=$anterior===null?'ENTREGA_DONACION':($delta>0?'AJUSTE_ENTRADA':'AJUSTE_SALIDA');
                $mov=self::inventory($db,$id,$tipo,abs($delta),$delta,null,null,null,null,null,$anterior===null?$nota:$motivo,$anterior===null?'ENTREGA SIN CARGO':'CORRECCION ENTREGA',$receptor);
                $marcar->execute([$entrega,$mov]);$movimientos[]=$mov;
            }
            self::audit($db,$auth,$anterior===null?'ENTREGA_DOLOR':'CORRECCION_ENTREGA_DOLOR','medicamentos_entregas',$entrega,
                $anterior===null?null:['entrega'=>$anterior,'items'=>$previos],
                ['items'=>$pedidos,'revision'=>$revision,'motivo'=>$motivo,'movimientos'=>$movimientos,'receptor'=>$receptor,'paciente'=>$paciente,'paciente_dni'=>$pacienteDni,'nombre_receptor'=>$nombre,'apellido_receptor'=>$apellido,'dni_receptor'=>$dni,'celular_receptor'=>$celular,'observaciones'=>$nota]);
            return ['id_entrega'=>$entrega,'revision'=>$revision,'id_movimientos'=>$movimientos,'id_ingreso_contable'=>null,'importe'=>0];
        },$auth,$b,'entregarDolor');
    }

    protected static function anularOperacionEconomica(array $auth,array $b): array {
        return self::transaccionMed($auth['db'],static function(PDO $db)use($auth,$b){
            $id=positive_id($b['id_movimiento']??null,'movimiento');
            // 450: deja lugar a los prefijos de los detalles de stock y contables (500).
            $motivo=self::textoLimitado($b,'motivo',450,'motivo de anulación');
            if(!$motivo || self::largo($motivo)<10)api_error('Ingresá un motivo de anulación de al menos 10 caracteres.');
            if(!in_array($b['devolucion_confirmada']??null,[1,'1',true],true))api_error('Confirmá la devolución física y económica.');
            $q=$db->prepare('SELECT id_medicamento FROM medicamentos_movimientos WHERE id_movimiento=?');
            $q->execute([$id]);$med=(int)$q->fetchColumn();
            if($med<1)api_error('Movimiento no encontrado.');
            // Bloquear antes de consultar las condiciones evita ofrecer/revertir
            // stock en base a lecturas viejas frente a movimientos simultáneos.
            $medRow=self::medicamentoBloqueado($db,$med,false);
            $regla=self::motivoNoAnulableSql();
            $q=$db->prepare("SELECT mov.*,($regla) AS motivo_no_anulable
                FROM medicamentos_movimientos mov
                JOIN medicamentos m ON m.id_medicamento=mov.id_medicamento
                WHERE mov.id_movimiento=? FOR UPDATE");
            $q->execute([$id]);$mov=$q->fetch(PDO::FETCH_ASSOC);
            if(!$mov)api_error('Movimiento no encontrado.');
            if($mov['motivo_no_anulable']!==null)api_error($mov['motivo_no_anulable']);
            $medio=self::medio($db,$b['id_medio_pago']??null);
            $compra=$mov['tipo']==='INGRESO_COMPRA';
            $cambioVencimiento=null;
            $idContable=(int)$mov[$compra?'id_egreso_contable':'id_ingreso_contable'];
            if($idContable<1)api_error('La operación no tiene asiento contable original.');
            if($compra){
                // Evitar devolución de compras cuyo inventario haya sido utilizado.
                $q=$db->prepare("SELECT COUNT(*) FROM medicamentos_movimientos WHERE id_medicamento=? AND id_movimiento>? AND variacion_disponible<0");
                $q->execute([$med,$id]);if((int)$q->fetchColumn()>0)api_error('La compra ya tuvo consumo de stock posterior. Registrá una corrección supervisada.');
                $q=$db->prepare('SELECT importe FROM contable_egresos WHERE id_egreso=? FOR UPDATE');$q->execute([$idContable]);$total=$q->fetchColumn();if($total===false)api_error('No se encontró el egreso original.');
                $comp=self::ingresoContable($db,date('Y-m-d'),$medio,'REINTEGROS DE COMPRAS DE MEDICAMENTOS','REINTEGRO DE COMPRA DE MEDICAMENTOS',(string)$total,'Anulación de compra #'.$idContable.'. '.$motivo);
                $nuevo=self::inventory($db,$med,'AJUSTE_SALIDA',(int)$mov['cantidad'],-(int)$mov['cantidad'],null,null,null,$comp,null,'ANULACIÓN DE COMPRA: '.$motivo,null,null,null,$id);
                $vencimientoAntes=$medRow['fecha_vencimiento']===null?null:(string)$medRow['fecha_vencimiento'];
                $vencimientoFinal=self::vencimientoTrasAnularCompra($db,$med,$id,$mov,$vencimientoAntes);
                [$ultimoIngreso,$ultimoOrigen]=self::ultimoIngresoVigente($db,$med,$id);
                $db->prepare('UPDATE medicamentos SET fecha_vencimiento=?,ultimo_ingreso=?,ultimo_origen=? WHERE id_medicamento=?')
                    ->execute([$vencimientoFinal,$ultimoIngreso,$ultimoOrigen,$med]);
                $cambioVencimiento=['fecha_vencimiento_antes'=>$vencimientoAntes,'fecha_vencimiento_despues'=>$vencimientoFinal];
            } else {
                $q=$db->prepare('SELECT importe FROM contable_ingresos WHERE id_ingreso=? FOR UPDATE');$q->execute([$idContable]);$total=$q->fetchColumn();if($total===false)api_error('No se encontró el ingreso original.');
                $comp=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE VENTAS DE MEDICAMENTOS','DEVOLUCIÓN DE VENTA DE MEDICAMENTOS',(string)$total,'Anulación de venta #'.$idContable.'. '.$motivo);
                $nuevo=self::inventory($db,$med,'AJUSTE_ENTRADA',(int)$mov['cantidad'],(int)$mov['cantidad'],null,null,null,null,$comp,'ANULACIÓN DE VENTA: '.$motivo,null,null,null,$id);
            }
            self::audit($db,$auth,$compra?'ANULAR_COMPRA':'ANULAR_VENTA','medicamentos_movimientos',$id,['asiento'=>$idContable],
                ['compensacion'=>$comp,'motivo'=>$motivo,'movimiento'=>$nuevo]+($cambioVencimiento??[]));
            $respuesta=['operacion_anulada'=>$compra?'COMPRA':'VENTA','id_movimiento'=>$nuevo,'id_contable_compensatorio'=>$comp];
            if($cambioVencimiento!==null) $respuesta['fecha_vencimiento']=$cambioVencimiento['fecha_vencimiento_despues'];
            return $respuesta;
        },$auth,$b,'anularOperacionEconomica');
    }

    /**
     * Fecha única que corresponde al stock que queda después de anular una compra.
     * - Si la fecha vigente es la que puso la compra y no hubo ingresos posteriores
     *   vigentes, se restaura exactamente la fecha previa a la compra.
     * - En cualquier otro caso no puede reconstruirse con certeza sin lotes: se
     *   conserva la fecha MÁS PRÓXIMA entre la previa y la vigente (criterio
     *   conservador: nunca extiende la vida útil del stock remanente).
     * Las compras anteriores a este control (sin vencimiento_aplicado) con stock
     * remanente quedan bloqueadas por motivoNoAnulableSql().
     */
    private static function vencimientoTrasAnularCompra(PDO $db,int $med,int $idCompra,array $mov,?string $vigente): ?string {
        if($mov['vencimiento_aplicado']===null) return $vigente;
        $previa=$mov['vencimiento_anterior']===null?null:(string)$mov['vencimiento_anterior'];
        $aplicada=(string)$mov['vencimiento_aplicado'];
        $q=$db->prepare("SELECT COUNT(*) FROM medicamentos_movimientos x
            WHERE x.id_medicamento=? AND x.id_movimiento>? AND x.variacion_disponible>0
              AND x.tipo IN ('INGRESO_COMPRA','INGRESO_DONACION','INGRESO_INICIAL','AJUSTE_ENTRADA','INGRESO_OTRO')
              AND x.origen IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM medicamentos_movimientos r WHERE r.id_movimiento_anulado=x.id_movimiento)");
        $q->execute([$med,$idCompra]);
        $ingresosPosteriores=(int)$q->fetchColumn()>0;
        if($vigente===$aplicada && !$ingresosPosteriores) return $previa;
        if($previa===null) return $vigente;
        if($vigente===null) return $previa;
        return min($previa,$vigente);
    }

    /** Último ingreso vigente (excluye la compra anulada y los reingresos por anulación de venta). */
    private static function ultimoIngresoVigente(PDO $db,int $med,int $excluir): array {
        $q=$db->prepare("SELECT DATE(x.fecha_movimiento) AS fecha,x.origen FROM medicamentos_movimientos x
            WHERE x.id_medicamento=? AND x.id_movimiento<>? AND x.variacion_disponible>0 AND x.origen IS NOT NULL
              AND x.tipo IN ('INGRESO_COMPRA','INGRESO_DONACION','INGRESO_INICIAL','AJUSTE_ENTRADA','INGRESO_OTRO')
              AND NOT EXISTS (SELECT 1 FROM medicamentos_movimientos r WHERE r.id_movimiento_anulado=x.id_movimiento)
            ORDER BY x.fecha_movimiento DESC,x.id_movimiento DESC LIMIT 1");
        $q->execute([$med,$excluir]);
        $row=$q->fetch(PDO::FETCH_ASSOC);
        return $row ? [(string)$row['fecha'],(string)$row['origen']] : [null,null];
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
            $medio=self::medioEfectivo($db,$b['id_medio_pago']??null);
            $nombre=($p['nombre_receptor'] && $p['apellido_receptor'])
                ? trim($p['nombre_receptor'].' '.$p['apellido_receptor'])
                : self::nombreSocioPrestamo($db,(int)$p['id_socio']);
            $egreso=self::egresoContable($db,date('Y-m-d'),$medio,'DEVOLUCIONES DE SEÑAS','DEVOLUCIÓN DE SEÑA',$monto,'Devolución seña préstamo #'.$id,$nombre);
            $db->prepare("INSERT INTO medicamentos_prestamos_senas_movimientos (id_prestamo,fecha_movimiento,tipo,monto,id_medio_pago,id_egreso_contable,observaciones) VALUES (?,?,'DEVOLUCION_SENA',?,?,?,?)")
                ->execute([$id,date('Y-m-d H:i:s'),$monto,$medio,$egreso,self::str($b,'observaciones',500)]);
            $mov=(int)$db->lastInsertId();
            self::audit($db,$auth,'DEVOLUCION_SENA','medicamentos_prestamos_senas_movimientos',$mov,null,['prestamo'=>$id,'monto'=>$monto,'egreso'=>$egreso]);
            return ['id_movimiento_sena'=>$mov];
        },$auth,$b,'registrarSena');
    }
}
