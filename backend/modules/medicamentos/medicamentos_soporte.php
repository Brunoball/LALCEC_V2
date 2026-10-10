<?php
declare(strict_types=1);
trait MedicamentosSoporte {
    private static function req(array $b,string $key,int $max=180): string { return required_text($b,$key,$key,$max); }
    private static function str(array $b,string $key,int $max=500): ?string { $v=clean_text($b[$key]??'',$max,true); return $v!==''?$v:null; }
    private static function qty(mixed $v): int { $n=filter_var($v,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000000]]); if($n===false) api_error('La cantidad debe ser un entero positivo.'); return (int)$n; }
    private static function money(mixed $v,bool $allowZero=false): string {
        if(!is_string($v)&&!is_int($v)&&!is_float($v)) api_error('Importe inválido.');
        $s=trim((string)$v);
        if (!preg_match('/^\d{1,10}(?:\.\d{1,2})?$/D',$s)) api_error('El importe debe tener hasta dos decimales.');
        $number=(float)$s;
        if(($allowZero?$number<0:$number<=0)||$number>9999999999.99) api_error('Importe fuera de rango.');
        return number_format($number,2,'.','');
    }
    private static function date(mixed $v,string $label='fecha'): string {
        $s=trim((string)$v); $d=DateTimeImmutable::createFromFormat('!Y-m-d',$s);
        if(!$d||$d->format('Y-m-d')!==$s) api_error('La '.$label.' no es válida.'); return $s;
    }
    private static function enum(mixed $v,array $values,string $label): string { $s=(string)$v; if(!in_array($s,$values,true)) api_error('Valor inválido para '.$label.'.'); return $s; }
    /** Todas las operaciones de inventario bloquean medicamento ANTES que lote.
     * Se evita así un interbloqueo entre salidas, préstamos y bajas concurrentes.
     */
    private static function bloquearMedicamentos(PDO $db,array $ids): void {
        $ids=array_values(array_unique(array_map('intval',$ids)));
        sort($ids,SORT_NUMERIC);
        $q=$db->prepare('SELECT id_medicamento FROM medicamentos WHERE id_medicamento=? FOR UPDATE');
        foreach($ids as $id) {
            $q->execute([$id]);
            if(!$q->fetchColumn()) api_error('Un medicamento del préstamo ya no existe.');
            $q->closeCursor();
        }
    }
    private static function lockedLote(PDO $db,int $id,bool $usable=false): array {
        // Consulta sin bloqueo para averiguar el padre; id_medicamento nunca se
        // reasigna por la API. Se vuelve a verificar tras obtener ambos bloqueos.
        $q=$db->prepare('SELECT id_medicamento FROM medicamentos_lotes WHERE id_lote=?');
        $q->execute([$id]); $med=(int)$q->fetchColumn();
        if($med<1) api_error('El lote ya no existe.');
        self::bloquearMedicamentos($db,[$med]);
        $st=$db->prepare('SELECT l.*,m.activo AS medicamento_activo,m.nombre_comercial FROM medicamentos_lotes l JOIN medicamentos m ON m.id_medicamento=l.id_medicamento WHERE l.id_lote=? FOR UPDATE');
        $st->execute([$id]); $r=$st->fetch();
        if(!$r || (int)$r['id_medicamento']!==$med) api_error('El lote ya no está disponible. Volvé a cargar la pantalla.');
        if($usable && (!(bool)$r['medicamento_activo'] || $r['estado']!=='ACTIVO' || $r['fecha_vencimiento']<date('Y-m-d'))) api_error('El medicamento o lote está inactivo, bloqueado o vencido.');
        return $r;
    }
    private static function medio(PDO $db,mixed $id): int {
        $id=positive_id($id,'medio de pago'); $s=$db->prepare('SELECT id_medio_pago FROM medios_pago WHERE id_medio_pago=? AND activo=1 FOR UPDATE'); $s->execute([$id]);
        if(!$s->fetchColumn()) api_error('Seleccioná un medio de pago activo.'); return $id;
    }
    /** Reintenta conflictos transitorios. Cada transacción termina en rollback
     * antes de reintentarse; el trabajo anterior jamás queda confirmado a medias.
     */
    private static function transaccionMed(PDO $db,callable $work): array {
        for($intento=0;$intento<3;$intento++) {
            // El helper general invoca el callback sin argumentos. Los flujos
            // de Medicamentos sí reciben PDO: se lo inyectamos aquí.
            try { return transaction($db,static fn(): array => $work($db)); }
            catch(PDOException $e) {
                $codigo=(int)($e->errorInfo[1]??0);
                if(!in_array($codigo,[1213,1205],true) && (string)$e->getCode()!=='40001') throw $e;
                if($intento===2) throw $e;
                usleep(50000*($intento+1));
            }
        }
        throw new LogicException('La transacción de medicamentos no pudo completarse.');
    }
    /**
     * Una misma clave de solicitud equivale a una operación de escritura, incluso
     * ante reintentos o respuestas perdidas. La fila se inserta y confirma en
     * la MISMA transacción que stock, contabilidad y auditoría.
     *
     * Sin clave mantenemos compatibilidad con clientes antiguos. La interfaz
     * actual siempre la envía. Requiere la migración SQL adjunta.
     */
    private static function tx(array $auth, callable $work): array {
        $db=$auth['db'];
        $body=request_body();
        $key=$body['_idempotency_key']??null;
        if($key===null) return self::transaccionMed($db,$work);
        if(!is_string($key)||!preg_match('/^[A-Za-z0-9_.:-]{16,100}$/D',$key))
            api_error('Clave de operación inválida.');
        if (function_exists('e2e_request_enabled') && e2e_request_enabled()) {
            // Nunca colisiona con una solicitud real y es identificable por
            // la limpieza global de Playwright, sin modificar el cliente.
            $key='e2e-'.hash('sha256',$key);
        }
        $action=request_action();
        unset($body['_idempotency_key']);
        // Evitar falsos positivos al cambiar el orden de las claves del JSON.
        $normalize=static function(mixed $value) use (&$normalize): mixed {
            if(!is_array($value)) return $value;
            if(!array_is_list($value)) ksort($value,SORT_STRING);
            foreach($value as &$item) $item=$normalize($item);
            return $value;
        };
        $fingerprint=hash('sha256',json_encode([$action,$normalize($body)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
        try {
            return self::transaccionMed($db,static function(PDO $db) use($key,$action,$fingerprint,$work): array {
                $db->prepare('INSERT INTO medicamentos_solicitudes (clave,accion,contenido_sha256) VALUES (?,?,?)')
                    ->execute([$key,$action,$fingerprint]);
                $result=$work($db);
                $db->prepare('UPDATE medicamentos_solicitudes SET resultado_json=? WHERE clave=?')
                    ->execute([json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR),$key]);
                return $result;
            });
        } catch(PDOException $error) {
            // Únicamente una clave duplicada puede reproducir un resultado anterior.
            // MySQL espera el COMMIT de la primera petición antes de responder 1062.
            if((int)($error->errorInfo[1]??0)!==1062) throw $error;
            $q=$db->prepare('SELECT accion,contenido_sha256,resultado_json FROM medicamentos_solicitudes WHERE clave=?');
            $q->execute([$key]); $prev=$q->fetch();
            if(!$prev) throw $error;
            if($prev['accion']!==$action||$prev['contenido_sha256']!==$fingerprint)
                api_error('La clave ya corresponde a otra operación. Volvé a abrir el formulario.');
            $previous=json_decode((string)$prev['resultado_json'],true);
            if(!is_array($previous)) throw new RuntimeException('Una solicitud anterior quedó incompleta.');
            return $previous;
        }
    }
    private static function inventory(PDO $db,int $lote,string $tipo,int $quantity,int $deltaDisp,int $deltaQuar,?int $detalle=null,?int $devolucion=null,?int $socio=null,?int $ingreso=null,?int $egreso=null,?string $nota=null): int {
        if($quantity<=0||($deltaDisp===0&&$deltaQuar===0)) api_error('Movimiento de stock inválido.');
        $q=$db->prepare('UPDATE medicamentos_lotes SET cantidad_disponible=cantidad_disponible+?,cantidad_cuarentena=cantidad_cuarentena+? WHERE id_lote=? AND cantidad_disponible>=? AND cantidad_cuarentena>=? AND cantidad_disponible+?<=4294967295 AND cantidad_cuarentena+?<=4294967295');
        $q->execute([$deltaDisp,$deltaQuar,$lote,max(0,-$deltaDisp),max(0,-$deltaQuar),$deltaDisp,$deltaQuar]); if($q->rowCount()!==1) api_error('Stock insuficiente o concurrentemente modificado.');
        $q=$db->prepare('INSERT INTO medicamentos_movimientos (id_lote,fecha_movimiento,tipo,cantidad,variacion_disponible,variacion_cuarentena,id_detalle_prestamo,id_devolucion,id_socio,id_ingreso_contable,id_egreso_contable,detalle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        $q->execute([$lote,date('Y-m-d H:i:s'),$tipo,$quantity,$deltaDisp,$deltaQuar,$detalle,$devolucion,$socio,$ingreso,$egreso,$nota]); return (int)$db->lastInsertId();
    }
    /** Asegura que los movimientos automáticos aparezcan en los filtros y
     * selectores de Contabilidad. Idempotente gracias al índice UNIQUE(tipo,nombre).
     * Si el administrador dio de baja la opción, esa decisión se respeta.
     */
    private static function opcionContableAutomatica(PDO $db, string $tipo, string $nombre): void {
        $q=$db->prepare("INSERT INTO contable_opciones (tipo,nombre,activo)
            VALUES (?,?,1) ON DUPLICATE KEY UPDATE id_opcion=id_opcion");
        $q->execute([$tipo,$nombre]);
    }
    private static function ingresoContable(PDO $db,string $fecha,int $medio,string $categoria,string $concepto,string $monto,?string $detalle=null): int {
        if((float)$monto>9999999999.99) api_error('El importe supera el máximo permitido por Contabilidad.');
        self::opcionContableAutomatica($db,'CATEGORIA_INGRESO',$categoria);
        self::opcionContableAutomatica($db,'CONCEPTO_INGRESO',$concepto);
        $s=$db->prepare('INSERT INTO contable_ingresos (fecha,id_medio_pago,categoria,concepto,importe,detalle) VALUES (?,?,?,?,?,?)');
        $s->execute([$fecha,$medio,$categoria,$concepto,$monto,$detalle]); return (int)$db->lastInsertId();
    }
    private static function egresoContable(PDO $db,string $fecha,int $medio,string $categoria,string $concepto,string $monto,?string $detalle=null,?string $proveedor=null): int {
        if((float)$monto>9999999999.99) api_error('El importe supera el máximo permitido por Contabilidad.');
        self::opcionContableAutomatica($db,'CATEGORIA_EGRESO',$categoria);
        self::opcionContableAutomatica($db,'CONCEPTO_EGRESO',$concepto);
        $s=$db->prepare('INSERT INTO contable_egresos (fecha,id_medio_pago,categoria,concepto,importe,detalle,proveedor) VALUES (?,?,?,?,?,?,?)');
        $s->execute([$fecha,$medio,$categoria,$concepto,$monto,$detalle,$proveedor]); return (int)$db->lastInsertId();
    }
    private static function audit(PDO $db,array $auth,string $action,string $table,int $id,mixed $old,mixed $new): void {
        audit_change($db,$auth,'MEDICAMENTOS',$action,$table,$id,'Operación de medicamentos: '.$action,$old,$new);
    }
}
