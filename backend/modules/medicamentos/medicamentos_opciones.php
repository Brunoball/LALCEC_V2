<?php
declare(strict_types=1);
/** Catálogos editables; NO incluir los códigos operativos de compra/venta/ajuste. */
final class MedicamentosOpciones {
    private const CAMPOS = ['PRESENTACION' => 'presentacion', 'UNIDAD_STOCK' => 'unidad_stock'];

    private static function tipo(mixed $tipo): string {
        $tipo = strtoupper(trim((string)$tipo));
        if (!isset(self::CAMPOS[$tipo])) api_error('Selector de medicamentos inválido.', 'VALIDATION', 422);
        return $tipo;
    }
    private static function nombre(mixed $valor, string $tipo): string {
        if (!is_string($valor)) api_error('Ingresá el nombre de la opción.', 'VALIDATION', 422);
        $nombre = trim(preg_replace('/\s+/u', ' ', $valor) ?? '');
        $max = $tipo === 'PRESENTACION' ? 100 : 40;
        $length = function_exists('mb_strlen') ? mb_strlen($nombre, 'UTF-8') : strlen($nombre);
        if ($length < 1 || $length > $max) api_error('El nombre debe tener entre 1 y '.$max.' caracteres.', 'VALIDATION', 422);
        if (preg_match('/[\x00-\x1F\x7F]/u', $nombre)) api_error('El nombre contiene caracteres no permitidos.', 'VALIDATION', 422);
        return function_exists('mb_strtoupper') ? mb_strtoupper($nombre, 'UTF-8') : strtoupper($nombre);
    }
    private static function usos(PDO $db, string $tipo, string $nombre): int {
        $campo = self::CAMPOS[$tipo]; // Identificador de lista blanca.
        $q = $db->prepare("SELECT COUNT(*) FROM medicamentos WHERE `$campo` = ?");
        $q->execute([$nombre]);
        return (int)$q->fetchColumn();
    }
    private static function obtenerPorId(PDO $db, int $id): array {
        $q=$db->prepare('SELECT * FROM medicamentos_opciones WHERE id_opcion=? FOR UPDATE');
        $q->execute([$id]);$row=$q->fetch(PDO::FETCH_ASSOC);
        if (!$row) api_error('Opción de medicamentos inexistente.', 'NOT_FOUND', 404);
        return $row;
    }
    private static function auditar(PDO $db,array $a,string $operacion,int $id,mixed $antes,mixed $despues): void {
        audit_change($db,$a,'MEDICAMENTOS',$operacion,'medicamentos_opciones',$id,'Configuración de selectores de medicamentos.',$antes,$despues);
    }
    public static function listar(): never {
        $a=auth_context();$db=$a['db'];
        $items=$db->query('SELECT id_opcion,tipo,nombre,activo FROM medicamentos_opciones ORDER BY tipo,activo DESC,nombre,id_opcion')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($items as &$item) $item['cantidad_usos']=self::usos($db,(string)$item['tipo'],(string)$item['nombre']);
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
                if ($antes['nombre']!==$nombre && self::usos($db,$tipo,$antes['nombre'])>0)
                    api_error('La opción está en uso. Para mantener el historial, dala de baja y creá otra opción con el nombre nuevo.', 'OPTION_IN_USE', 409);
                $db->prepare('UPDATE medicamentos_opciones SET nombre=? WHERE id_opcion=?')->execute([$nombre,$id]);
                self::auditar($db,$a,'EDITAR_OPCION',$id,$antes,['tipo'=>$tipo,'nombre'=>$nombre]);
                return ['id_opcion'=>$id,'creado'=>false,'nombre'=>$nombre];
            }
            $db->prepare('INSERT INTO medicamentos_opciones (tipo,nombre,activo) VALUES (?,?,1)')->execute([$tipo,$nombre]);
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
            if (self::usos($db,$antes['tipo'],$antes['nombre'])>0)
                api_error('No se puede eliminar una opción utilizada por medicamentos. Podés darla de baja sin perder el historial.','OPTION_IN_USE',409);
            $db->prepare('DELETE FROM medicamentos_opciones WHERE id_opcion=?')->execute([$id]);
            self::auditar($db,$a,'ELIMINAR_OPCION',$id,$antes,null);
        });
        api_success(['id_opcion'=>$id],'Opción eliminada definitivamente.');
    }
    /** Para el alta/edición de medicamentos, aceptar valores dados de baja solo si el registro ya los tenía. */
    public static function validar(PDO $db,string $tipo,string $nombre,?string $valorActual=null): void {
        if ($valorActual!==null && $valorActual===$nombre) return;
        $q=$db->prepare('SELECT id_opcion FROM medicamentos_opciones WHERE tipo=? AND nombre=? AND activo=1 LIMIT 1');
        $q->execute([$tipo,$nombre]);
        if (!$q->fetchColumn()) api_error('La opción de '.($tipo==='PRESENTACION'?'presentación':'unidad de stock').' no está disponible. Actualizá el selector.', 'OPTION_INACTIVE',422);
    }
}
