<?php
declare(strict_types=1);
trait MedicamentosConsultas {
    protected static function catalogoDatos(PDO $db): array {
        // La fecha de PHP está configurada como Argentina/Córdoba. MySQL puede
        // tener una zona distinta en Hostinger: nunca mezclar sus "hoy".
        $hoy=date('Y-m-d');
        $q=$db->prepare("SELECT m.*, COUNT(l.id_lote) lotes,
          COALESCE(SUM(CASE WHEN m.activo=1 AND l.estado='ACTIVO' AND l.fecha_vencimiento>=? THEN l.cantidad_disponible ELSE 0 END),0) AS stock_utilizable,
          COALESCE(SUM(l.cantidad_cuarentena),0) stock_cuarentena,
          COALESCE(SUM(l.cantidad_disponible),0) stock_total,
          COALESCE(SUM(CASE WHEN l.estado='ACTIVO' AND l.fecha_vencimiento>=? AND l.cantidad_disponible>0 THEN 1 ELSE 0 END),0) AS lotes_utilizables,
          COALESCE(SUM(CASE WHEN l.estado='BLOQUEADO' AND l.cantidad_disponible>0 THEN 1 ELSE 0 END),0) AS lotes_bloqueados,
          COALESCE(SUM(CASE WHEN l.estado<>'DESCARTADO' AND l.fecha_vencimiento<? AND l.cantidad_disponible>0 THEN 1 ELSE 0 END),0) AS lotes_vencidos,
          COALESCE(SUM(CASE WHEN l.estado='DESCARTADO' THEN 1 ELSE 0 END),0) AS lotes_descartados,
          COALESCE(SUM(CASE WHEN l.fecha_vencimiento<? THEN l.cantidad_disponible ELSE 0 END),0) stock_vencido,
          MIN(CASE WHEN m.activo=1 AND l.estado='ACTIVO' AND l.cantidad_disponible>0 AND l.fecha_vencimiento>=? THEN l.fecha_vencimiento END) AS proximo_vencimiento,
          MAX(CASE WHEN l.origen<>'DEVOLUCION' THEN l.fecha_ingreso END) AS ultimo_ingreso,
          (SELECT l2.origen FROM medicamentos_lotes l2 WHERE l2.id_medicamento=m.id_medicamento AND l2.origen<>'DEVOLUCION' ORDER BY l2.fecha_ingreso DESC,l2.id_lote DESC LIMIT 1) AS ultimo_origen
          FROM medicamentos m LEFT JOIN medicamentos_lotes l ON l.id_medicamento=m.id_medicamento
          GROUP BY m.id_medicamento ORDER BY m.nombre_comercial,m.droga");
        $q->execute(array_fill(0,5,$hoy));
        return $q->fetchAll();
    }
    protected static function lotesDatos(PDO $db,array $filter): array {
        $id=(int)($filter['id_medicamento']??0);
        $sql="SELECT l.*,m.nombre_comercial,m.droga,m.dosis,m.unidad_stock,m.activo AS medicamento_activo FROM medicamentos_lotes l JOIN medicamentos m ON m.id_medicamento=l.id_medicamento";
        if($id>0) { $q=$db->prepare($sql.' WHERE l.id_medicamento=? ORDER BY l.fecha_vencimiento,l.id_lote');$q->execute([$id]);return $q->fetchAll(); }
        if((int)($filter['disponibles']??0)===1) {
            $q=$db->prepare($sql." WHERE m.activo=1 AND l.estado='ACTIVO' AND l.fecha_vencimiento>=? AND l.cantidad_disponible>0 ORDER BY m.nombre_comercial,l.fecha_vencimiento,l.id_lote");
            $q->execute([date('Y-m-d')]);
            return $q->fetchAll();
        }
        return $db->query($sql.' ORDER BY l.fecha_vencimiento,l.id_lote')->fetchAll();
    }
    protected static function historialDatos(PDO $db,array $filter): array {
        $id=(int)($filter['id_medicamento']??0);
        $sql=" FROM medicamentos_movimientos mov JOIN medicamentos_lotes l ON l.id_lote=mov.id_lote JOIN medicamentos m ON m.id_medicamento=l.id_medicamento";
        if($id>0) {
            $page=max(1,min(100000,(int)($filter['pagina']??1)));
            $perPage=50;
            $q=$db->prepare('SELECT COUNT(*)'.$sql.' WHERE m.id_medicamento=?');
            $q->execute([$id]);$total=(int)$q->fetchColumn();
            $page=min($page,max(1,(int)ceil($total/$perPage)));
            $q=$db->prepare('SELECT mov.*,l.numero_lote,l.fecha_vencimiento,m.nombre_comercial,m.droga,
                        CASE WHEN mov.tipo=\'INGRESO_COMPRA\' THEN EXISTS (
                            SELECT 1 FROM medicamentos_movimientos ar
                            WHERE ar.id_lote=mov.id_lote AND ar.tipo=\'AJUSTE_SALIDA\'
                              AND ar.detalle=CONCAT(\'ANULACION COMPRA #\',mov.id_egreso_contable))
                        WHEN mov.tipo=\'SALIDA_VENTA\' THEN EXISTS (
                            SELECT 1 FROM medicamentos_movimientos ar
                            JOIN medicamentos_lotes al ON al.id_lote=ar.id_lote
                            WHERE al.id_medicamento=m.id_medicamento AND ar.tipo=\'AJUSTE_ENTRADA\'
                              AND ar.detalle=CONCAT(\'ANULACION VENTA #\',mov.id_ingreso_contable))
                        ELSE 0 END AS anulada'.$sql.' WHERE m.id_medicamento=? ORDER BY mov.id_movimiento DESC LIMIT ? OFFSET ?');
            $q->bindValue(1,$id,PDO::PARAM_INT);
            $q->bindValue(2,$perPage,PDO::PARAM_INT);
            $q->bindValue(3,($page-1)*$perPage,PDO::PARAM_INT);
            $q->execute();
            return ['registros'=>$q->fetchAll(),'total'=>$total,'pagina'=>$page,'por_pagina'=>$perPage];
        }
        // Compatibilidad con las consultas globales existentes.
        return ['registros'=>$db->query('SELECT mov.*,l.numero_lote,l.fecha_vencimiento,m.nombre_comercial,m.droga'.$sql.' ORDER BY mov.id_movimiento DESC LIMIT 300')->fetchAll()];
    }
    /** Buscar procedencias sin duplicar registros: opciones de Contable y socios existentes.
     * Se guarda una instantánea del nombre en medicamentos_lotes.procedencia;
     * los externos se permiten manualmente desde el mismo campo.
     */
    protected static function buscarProcedencias(PDO $db,array $params): array {
        $buscar=trim((string)($params['buscar']??''));
        $buscar=function_exists('mb_substr') ? mb_substr($buscar,0,70,'UTF-8') : substr($buscar,0,70);
        $patron='%'.$buscar.'%';
        $proveedores=$db->prepare("SELECT id_opcion,nombre FROM contable_opciones
            WHERE tipo='PROVEEDOR' AND activo=1 AND nombre LIKE ? ORDER BY nombre LIMIT 25");
        $proveedores->execute([$patron]);
        $resultado=[];
        foreach($proveedores->fetchAll() as $p) {
            $resultado[]=['clave'=>'PROVEEDOR:'.$p['id_opcion'],'tipo'=>'PROVEEDOR',
                'nombre'=>$p['nombre'],'detalle'=>'CONTABLE'];
        }
        $socios=$db->prepare("SELECT s.id_socio,s.estado,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ',p.apellido,p.nombre)),''),e.razon_social) AS denominacion,
            COALESCE(p.dni,e.cuit) AS documento
            FROM socios s
            LEFT JOIN socios_personas p ON p.id_socio=s.id_socio
            LEFT JOIN socios_empresas e ON e.id_socio=s.id_socio
            WHERE NOT EXISTS (SELECT 1 FROM socios_eliminados x WHERE x.id_socio=s.id_socio)
              AND (CONCAT_WS(' ',p.apellido,p.nombre) LIKE ? OR CONCAT_WS(' ',p.nombre,p.apellido) LIKE ?
                OR CONCAT(p.apellido, ', ', p.nombre) LIKE ? OR p.dni LIKE ? OR e.razon_social LIKE ? OR e.cuit LIKE ?)
            ORDER BY denominacion LIMIT 25");
        $socios->execute(array_fill(0,6,$patron));
        foreach($socios->fetchAll() as $s) {
            if(trim((string)$s['denominacion'])==='') continue;
            $detalle=trim((string)($s['documento']??''));
            if($s['estado']!=='ACTIVO') $detalle=trim($detalle.' · INACTIVO');
            $resultado[]=['clave'=>'SOCIO:'.$s['id_socio'],'tipo'=>'SOCIO',
                'nombre'=>$s['denominacion'],'detalle'=>$detalle];
        }
        return $resultado;
    }
    protected static function buscarSocios(PDO $db,array $params): array {
        $buscar=trim((string)($params['buscar']??''));
        $sql="SELECT s.id_socio,s.estado,COALESCE(CONCAT(p.apellido,', ',p.nombre),e.razon_social) denominacion,COALESCE(p.dni,e.cuit) documento FROM socios s LEFT JOIN socios_personas p ON p.id_socio=s.id_socio LEFT JOIN socios_empresas e ON e.id_socio=s.id_socio WHERE s.estado='ACTIVO' AND NOT EXISTS (SELECT 1 FROM socios_eliminados z WHERE z.id_socio=s.id_socio)";
        if($buscar==='') {
            return $db->query($sql.' ORDER BY denominacion LIMIT 30')->fetchAll();
        }
        $sql.=' AND (p.apellido LIKE ? OR p.nombre LIKE ? OR CONCAT_WS(\' \',p.apellido,p.nombre) LIKE ? OR CONCAT(p.apellido, \', \', p.nombre) LIKE ? OR p.dni LIKE ? OR e.razon_social LIKE ? OR e.cuit LIKE ?) ORDER BY denominacion LIMIT 30';
        $q=$db->prepare($sql);
        $q->execute(array_fill(0,7,'%'.(function_exists('mb_substr') ? mb_substr($buscar,0,70,'UTF-8') : substr($buscar,0,70)).'%'));
        return $q->fetchAll();
    }
    protected static function prestamosDatos(PDO $db,array $filter): array {
        $status=(string)($filter['estado']??'');
        $search=trim((string)($filter['buscar']??''));
        $search=function_exists('mb_substr')?mb_substr($search,0,90,'UTF-8'):substr($search,0,90);
        $page=max(1,min(100000,(int)($filter['pagina']??1)));$perPage=20;
        $from=" FROM medicamentos_prestamos p LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio";
        $nombreSocio="COALESCE(NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio))";
        $documentoSocio="COALESCE(NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento)";
        $where=[];$params=[];
        if(in_array($status,['ABIERTO','CERRADO','ANULADO'],true)){$where[]='p.estado=?';$params[]=$status;}
        if($search!==''){
            $where[]="({$nombreSocio} LIKE ? OR {$documentoSocio} LIKE ? OR CAST(p.id_prestamo AS CHAR) LIKE ?)";
            array_push($params,...array_fill(0,3,'%'.$search.'%'));
        }
        $suffix=$where?' WHERE '.implode(' AND ',$where):'';
        $q=$db->prepare('SELECT COUNT(*)'.$from.$suffix);$q->execute($params);$total=(int)$q->fetchColumn();
        $page=min($page,max(1,(int)ceil($total/$perPage)));
        $sql="SELECT p.*,{$nombreSocio} AS socio,{$documentoSocio} AS documento,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='COBRO_SENA'),0) AS sena_cobrada,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='DEVOLUCION_SENA'),0) AS sena_devuelta,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='SENA_DONADA'),0) AS sena_donada,(SELECT COUNT(*) FROM medicamentos_prestamos_detalle d WHERE d.id_prestamo=p.id_prestamo) renglones";
        $q=$db->prepare($sql.$from.$suffix.' ORDER BY p.id_prestamo DESC LIMIT ? OFFSET ?');
        foreach($params as $index=>$param)$q->bindValue($index+1,$param,PDO::PARAM_STR);
        $q->bindValue(count($params)+1,$perPage,PDO::PARAM_INT);
        $q->bindValue(count($params)+2,($page-1)*$perPage,PDO::PARAM_INT);
        $q->execute();
        return ['registros'=>$q->fetchAll(),'total'=>$total,'pagina'=>$page,'por_pagina'=>$perPage];
    }
    protected static function prestamoDatos(PDO $db,int $id): array {
        $q=$db->prepare("SELECT p.*,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio)) socio,COALESCE(NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento) documento FROM medicamentos_prestamos p LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio WHERE p.id_prestamo=?");$q->execute([$id]);$p=$q->fetch();if(!$p)api_error('Préstamo no encontrado.','NOT_FOUND',404);
        $q=$db->prepare('SELECT d.*,l.numero_lote,m.nombre_comercial,m.droga,m.dosis,COALESCE((SELECT SUM(r.cantidad) FROM medicamentos_prestamos_devoluciones r WHERE r.id_detalle_prestamo=d.id_detalle_prestamo AND r.estado IN (\'APROBADA\',\'PENDIENTE_REVISION\')),0) AS cantidad_recibida FROM medicamentos_prestamos_detalle d JOIN medicamentos_lotes l ON l.id_lote=d.id_lote JOIN medicamentos m ON m.id_medicamento=l.id_medicamento WHERE d.id_prestamo=?');$q->execute([$id]);$det=$q->fetchAll();
        $q=$db->prepare('SELECT r.*,l.numero_lote,l.estado AS estado_lote_recibido FROM medicamentos_prestamos_devoluciones r LEFT JOIN medicamentos_lotes l ON l.id_lote=r.id_lote_recibido JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo WHERE d.id_prestamo=? ORDER BY r.id_devolucion DESC');$q->execute([$id]);$returns=$q->fetchAll();
        $q=$db->prepare('SELECT sm.*,mp.nombre medio_pago FROM medicamentos_prestamos_senas_movimientos sm LEFT JOIN medios_pago mp ON mp.id_medio_pago=sm.id_medio_pago WHERE sm.id_prestamo=? ORDER BY sm.id_movimiento_sena DESC');$q->execute([$id]);$senas=$q->fetchAll();
        return ['prestamo'=>$p,'detalle'=>$det,'devoluciones'=>$returns,'senas'=>$senas];
    }
}
