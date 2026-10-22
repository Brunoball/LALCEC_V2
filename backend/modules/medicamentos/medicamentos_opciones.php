<?php
declare(strict_types=1);
/**
 * Catálogos editables de Medicamentos (tabla medicamentos_opciones).
 *
 * Todos los selectores de opciones del módulo se arman desde esta tabla:
 * PRESENTACION, UNIDAD_STOCK y ORIGEN_INGRESO.
 *
 * En ORIGEN_INGRESO, las filas con codigo_sistema (COMPRA, DONACION, AJUSTE,
 * INICIAL) son los orígenes del sistema: su comportamiento está definido por
 * el código (la compra genera un egreso contable, el stock inicial solo se usa
 * al crear el medicamento, etc.). Se pueden renombrar y dar de baja, pero no
 * eliminar. Los movimientos guardan el código, por lo que renombrar no altera
 * el historial. Las filas sin codigo_sistema son orígenes adicionales sin costo.
 */
final class MedicamentosOpciones {
    private const CAMPOS = ['PRESENTACION' => 'presentacion', 'UNIDAD_STOCK' => 'unidad_stock', 'ORIGEN_INGRESO' => 'origen'];
    private const MAXIMOS = ['PRESENTACION' => 100, 'UNIDAD_STOCK' => 40, 'ORIGEN_INGRESO' => 60];
    /** Códigos internos de los orígenes del sistema. Un origen adicional no puede llamarse igual. */
    public const CODIGOS_ORIGEN_SISTEMA = ['COMPRA', 'DONACION', 'AJUSTE', 'INICIAL'];

    private static function tipo(mixed $tipo): string {
        $tipo = strtoupper(trim((string)$tipo));
        if (!isset(self::CAMPOS[$tipo])) api_error('Selector de medicamentos inválido.', 'VALIDATION', 422);
        return $tipo;
    }
    private static function nombre(mixed $valor, string $tipo): string {
        if (!is_string($valor)) api_error('Ingresá el nombre de la opción.', 'VALIDATION', 422);
        $nombre = trim(preg_replace('/\s+/u', ' ', $valor) ?? '');
        $max = self::MAXIMOS[$tipo];
        $length = function_exists('mb_strlen') ? mb_strlen($nombre, 'UTF-8') : strlen($nombre);
        if ($length < 1 || $length > $max) api_error('El nombre debe tener entre 1 y '.$max.' caracteres.', 'VALIDATION', 422);
        if (preg_match('/[\x00-\x1F\x7F]/u', $nombre)) api_error('El nombre contiene caracteres no permitidos.', 'VALIDATION', 422);
        return function_exists('mb_strtoupper') ? mb_strtoupper($nombre, 'UTF-8') : strtoupper($nombre);
    }
    private static function sinAcentos(string $v): string {
        return strtr($v, ['Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ü'=>'U']);
    }
    /** Un origen adicional no puede usar como nombre un código interno (se confundiría con el del sistema). */
    private static function validarNombreOrigenAdicional(string $nombre): void {
        if (in_array(self::sinAcentos($nombre), self::CODIGOS_ORIGEN_SISTEMA, true))
            api_error('«'.$nombre.'» está reservado para un origen del sistema. Elegí otro nombre.', 'OPTION_RESERVED', 422);
    }
    private static function usos(PDO $db, array $opcion): int {
        $tipo = (string)$opcion['tipo'];
        if ($tipo === 'ORIGEN_INGRESO') {
            // Sistema: los ingresos guardan el código. Adicional: guardan el nombre.
            $codigo = $opcion['codigo_sistema'] ?? null;
            $q = $codigo !== null && $codigo !== ''
                ? $db->prepare("SELECT COUNT(*) FROM medicamentos_movimientos WHERE tipo<>'INGRESO_OTRO' AND origen = ?")
                : $db->prepare("SELECT COUNT(*) FROM medicamentos_movimientos WHERE tipo='INGRESO_OTRO' AND origen = ?");
            $q->execute([$codigo !== null && $codigo !== '' ? $codigo : (string)$opcion['nombre']]);
            return (int)$q->fetchColumn();
        }
        $campo = self::CAMPOS[$tipo]; // Identificador de lista blanca.
        $q = $db->prepare("SELECT COUNT(*) FROM medicamentos WHERE `$campo` = ?");
        $q->execute([(string)$opcion['nombre']]);
        return (int)$q->fetchColumn();
    }
    private static function esSistema(array $opcion): bool {
        return ($opcion['codigo_sistema'] ?? null) !== null && $opcion['codigo_sistema'] !== '';
    }
    private static function obtenerPorId(PDO $db, int $id): array {
        $q=$db->prepare('SELECT * FROM medicamentos_opciones WHERE id_opcion=? FOR UPDATE');
        $q->execute([$id]);$row=$q->fetch(PDO::FETCH_ASSOC);
        if (!$row) api_error('Opción de medicamentos inexistente.', 'NOT_FOUND', 404);
        return $row;
    }
    /** Dos altas simultáneas con el mismo nombre: el índice UNIQUE decide y se informa 409, no un error interno. */
    private static function escribirSinDuplicar(callable $escritura): void {
        try { $escritura(); }
        catch (PDOException $e) {
            if (duplicate_key($e)) api_error('Ya existe esa opción para este selector.','OPTION_DUPLICATE',409);
            throw $e;
        }
    }
    private static function auditar(PDO $db,array $a,string $operacion,int $id,mixed $antes,mixed $despues): void {
        audit_change($db,$a,'MEDICAMENTOS',$operacion,'medicamentos_opciones',$id,'Configuración de selectores de medicamentos.',$antes,$despues);
    }
    public static function listar(): never {
        $a=auth_context();$db=$a['db'];
        // Orígenes del sistema primero; después alfabético.
        $items=$db->query('SELECT id_opcion,tipo,nombre,codigo_sistema,activo FROM medicamentos_opciones
            ORDER BY tipo,(codigo_sistema IS NULL),activo DESC,nombre,id_opcion')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($items as &$item) $item['cantidad_usos']=self::usos($db,$item);
        unset($item);
        api_success(['registros'=>$items]);
    }
    public static function guardar(): never {
        $a=require_admin();$b=request_body();$db=$a['db'];
        $tipo=self::tipo($b['tipo']??'');
        $nombre=self::nombre($b['nombre']??null,$tipo);
        $id=isset($b['id_opcion']) && $b['id_opcion']!=='' && $b['id_opcion']!==null ? positive_id($b['id_opcion'],'opción') : null;
        $result=transaction($db,static function()use($db,$a,$tipo,$nombre,$id):array {
            $duplicada=$db->prepare('SELECT id_opcion FROM medicamentos_opciones WHERE tipo=? AND nombre=? AND (? IS NULL OR id_opcion<>?) LIMIT 1');
            $duplicada->execute([$tipo,$nombre,$id,$id]);
            if ($duplicada->fetchColumn()) api_error('Ya existe esa opción para este selector.','OPTION_DUPLICATE',409);
            if ($id !== null) {
                $antes=self::obtenerPorId($db,$id);
                if ($antes['tipo']!==$tipo) api_error('No se puede cambiar el selector de una opción.', 'VALIDATION', 422);
                if ($tipo==='ORIGEN_INGRESO' && !self::esSistema($antes)) self::validarNombreOrigenAdicional($nombre);
                // Un origen del sistema se identifica por su código: renombrarlo no altera
                // el historial. El resto guarda el nombre como dato histórico.
                if (!self::esSistema($antes) && $antes['nombre']!==$nombre && self::usos($db,$antes)>0)
                    api_error('La opción está en uso. Para mantener el historial, dala de baja y creá otra opción con el nombre nuevo.', 'OPTION_IN_USE', 409);
                self::escribirSinDuplicar(static fn() => $db->prepare('UPDATE medicamentos_opciones SET nombre=? WHERE id_opcion=?')->execute([$nombre,$id]));
                self::auditar($db,$a,'EDITAR_OPCION',$id,$antes,['tipo'=>$tipo,'nombre'=>$nombre]);
                return ['id_opcion'=>$id,'creado'=>false,'nombre'=>$nombre];
            }
            if ($tipo==='ORIGEN_INGRESO') self::validarNombreOrigenAdicional($nombre);
            self::escribirSinDuplicar(static fn() => $db->prepare('INSERT INTO medicamentos_opciones (tipo,nombre,activo) VALUES (?,?,1)')->execute([$tipo,$nombre]));
            $nuevo=(int)$db->lastInsertId();
            self::auditar($db,$a,'CREAR_OPCION',$nuevo,null,['tipo'=>$tipo,'nombre'=>$nombre]);
            return ['id_opcion'=>$nuevo,'creado'=>true,'nombre'=>$nombre];
        });
        api_success($result, $id ? 'Opción actualizada.' : 'Opción agregada.');
    }
    public static function cambiarEstado(): never {
        $a=require_admin();$b=request_body();$db=$a['db'];
        $id=positive_id($b['id_opcion']??null,'opción');
        if (!in_array($b['activo']??null,[0,1,'0','1'],true)) api_error('Estado inválido.','VALIDATION',422);
        $activo=(int)$b['activo'];
        $result=transaction($db,static function()use($db,$a,$id,$activo):array {
            $antes=self::obtenerPorId($db,$id);
            $db->prepare('UPDATE medicamentos_opciones SET activo=? WHERE id_opcion=?')->execute([$activo,$id]);
            self::auditar($db,$a,$activo?'REACTIVAR_OPCION':'BAJA_OPCION',$id,$antes,['activo'=>$activo]);
            return ['id_opcion'=>$id,'activo'=>$activo];
        });
        api_success($result,$activo?'Opción reactivada.':'Opción dada de baja.');
    }
    public static function eliminar(): never {
        $a=require_admin();$b=request_body();$db=$a['db'];
        $id=positive_id($b['id_opcion']??null,'opción');
        transaction($db,static function()use($db,$a,$id):void {
            $antes=self::obtenerPorId($db,$id);
            if (self::esSistema($antes))
                api_error('«'.$antes['nombre'].'» es un origen del sistema: podés renombrarlo o darlo de baja, pero no eliminarlo.','OPTION_SYSTEM',409);
            if (self::usos($db,$antes)>0)
                api_error('No se puede eliminar una opción en uso. Podés darla de baja sin perder el historial.','OPTION_IN_USE',409);
            $db->prepare('DELETE FROM medicamentos_opciones WHERE id_opcion=?')->execute([$id]);
            self::auditar($db,$a,'ELIMINAR_OPCION',$id,$antes,null);
        });
        api_success(['id_opcion'=>$id],'Opción eliminada definitivamente.');
    }
    /** Para el alta/edición de medicamentos, aceptar valores dados de baja solo si el registro ya los tenía. */
    public static function validar(PDO $db,string $tipo,string $nombre,?string $valorActual=null): void {
        if ($valorActual!==null && $valorActual===$nombre) return;
        $q=$db->prepare('SELECT id_opcion FROM medicamentos_opciones WHERE tipo=? AND nombre=? AND activo=1 AND codigo_sistema IS NULL LIMIT 1');
        $q->execute([$tipo,$nombre]);
        $etiqueta = ['PRESENTACION'=>'presentación','UNIDAD_STOCK'=>'unidad de stock','ORIGEN_INGRESO'=>'origen'][$tipo] ?? 'selector';
        if (!$q->fetchColumn()) api_error('La opción de '.$etiqueta.' «'.$nombre.'» no está disponible. Actualizá el selector.', 'OPTION_INACTIVE',422);
    }
    /** Un origen del sistema dado de baja en Configuración no admite nuevos ingresos. */
    public static function validarOrigenSistema(PDO $db,string $codigo): void {
        $q=$db->prepare("SELECT nombre,activo FROM medicamentos_opciones WHERE tipo='ORIGEN_INGRESO' AND codigo_sistema=? LIMIT 1");
        $q->execute([$codigo]);$row=$q->fetch(PDO::FETCH_ASSOC);
        if ($row && (int)$row['activo']!==1)
            api_error('El origen «'.$row['nombre'].'» está dado de baja. Reactivalo en Configuración > Medicamentos > Orígenes de ingreso.','OPTION_INACTIVE',422);
    }
}
