<?php
declare(strict_types=1);
trait MedicamentosConsultas {
    /** Regla única para habilitar la anulación, usada por historial Y por la escritura.
     * Siempre se evalúa de nuevo dentro de la transacción de anulación, bajo bloqueo
     * del medicamento. Los datos enviados por el navegador no autorizan la operación.
     */
    protected static function motivoNoAnulableSql(): string {
        return "CASE
            WHEN mov.tipo NOT IN ('INGRESO_COMPRA','SALIDA_VENTA') THEN 'Este tipo de movimiento no admite anulación.'
            WHEN EXISTS (SELECT 1 FROM medicamentos_movimientos reverso WHERE reverso.id_movimiento_anulado=mov.id_movimiento)
                THEN 'La operación ya fue anulada.'
            WHEN mov.tipo='INGRESO_COMPRA' AND (mov.id_egreso_contable IS NULL
                OR NOT EXISTS (SELECT 1 FROM contable_egresos ce WHERE ce.id_egreso=mov.id_egreso_contable))
                THEN 'No se encontró el egreso contable original.'
            WHEN mov.tipo='SALIDA_VENTA' AND (mov.id_ingreso_contable IS NULL
                OR NOT EXISTS (SELECT 1 FROM contable_ingresos ci WHERE ci.id_ingreso=mov.id_ingreso_contable))
                THEN 'No se encontró el ingreso contable original.'
            WHEN mov.tipo='INGRESO_COMPRA' AND EXISTS
                (SELECT 1 FROM medicamentos_movimientos posterior
                 WHERE posterior.id_medicamento=mov.id_medicamento
                   AND posterior.id_movimiento>mov.id_movimiento
                   AND posterior.variacion_disponible<0)
                THEN 'La compra ya tuvo consumo de stock posterior. Registrá una corrección supervisada.'
            WHEN mov.tipo='INGRESO_COMPRA' AND m.stock_actual<mov.cantidad
                THEN 'No hay stock suficiente para revertir la compra.'
            WHEN mov.tipo='INGRESO_COMPRA' AND mov.vencimiento_aplicado IS NULL AND m.stock_actual>mov.cantidad
                THEN 'Compra registrada antes del control de vencimientos: anularla podría dejar una fecha incorrecta en el stock restante. Registrá un ajuste negativo y verificá la fecha en Editar > Datos.'
            WHEN mov.tipo='SALIDA_VENTA' AND m.stock_actual>4294967295-mov.cantidad
                THEN 'El reintegro supera el límite de stock del medicamento.'
            ELSE NULL END";
    }

    protected static function catalogoDatos(PDO $db): array {
        return $db->query('SELECT m.*,m.stock_actual AS stock_utilizable,m.stock_actual AS stock_total,EXISTS(SELECT 1 FROM medicamentos_movimientos a WHERE a.id_medicamento=m.id_medicamento LIMIT 1) AS tiene_movimientos
          FROM medicamentos m ORDER BY m.nombre_comercial,m.droga')->fetchAll();
    }
    protected static function historialDatos(PDO $db,array $filter): array {
        $id=(int)($filter['id_medicamento']??0);
        $from=' FROM medicamentos_movimientos mov JOIN medicamentos m ON m.id_medicamento=mov.id_medicamento';
        $regla=self::motivoNoAnulableSql();
        $campos="SELECT mov.*,m.nombre_comercial,m.droga,EXISTS(SELECT 1 FROM medicamentos_movimientos inv
                WHERE inv.id_movimiento_anulado=mov.id_movimiento) AS anulada,
                ($regla) AS motivo_no_anulable";
        if($id>0){
            $page=max(1,min(100000,(int)($filter['pagina']??1)));$perPage=50;
            $q=$db->prepare('SELECT COUNT(*)'.$from.' WHERE m.id_medicamento=?');$q->execute([$id]);$total=(int)$q->fetchColumn();
            $page=min($page,max(1,(int)ceil($total/$perPage)));
            $q=$db->prepare($campos.$from.' WHERE m.id_medicamento=? ORDER BY mov.id_movimiento DESC LIMIT ? OFFSET ?');
            $q->bindValue(1,$id,PDO::PARAM_INT);$q->bindValue(2,$perPage,PDO::PARAM_INT);$q->bindValue(3,($page-1)*$perPage,PDO::PARAM_INT);$q->execute();
            return ['registros'=>$q->fetchAll(),'total'=>$total,'pagina'=>$page,'por_pagina'=>$perPage];
        }
        return ['registros'=>$db->query($campos.$from.' ORDER BY mov.id_movimiento DESC LIMIT 300')->fetchAll()];
    }
    /** Buscar procedencias sin duplicar registros: proveedores activos de Contable y SOCIOS ACTIVOS.
     * Los socios inactivos o eliminados no se ofrecen como donantes/proveedores.
     * Se guarda una instantánea del nombre en medicamentos_movimientos.procedencia;
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
            WHERE s.estado='ACTIVO'
              AND NOT EXISTS (SELECT 1 FROM socios_eliminados x WHERE x.id_socio=s.id_socio)
              AND (CONCAT_WS(' ',p.apellido,p.nombre) LIKE ? OR CONCAT_WS(' ',p.nombre,p.apellido) LIKE ?
                OR CONCAT(p.apellido, ', ', p.nombre) LIKE ? OR p.dni LIKE ? OR e.razon_social LIKE ? OR e.cuit LIKE ?)
            ORDER BY denominacion LIMIT 25");
        $socios->execute(array_fill(0,6,$patron));
        foreach($socios->fetchAll() as $s) {
            if(trim((string)$s['denominacion'])==='') continue;
            $detalle=trim((string)($s['documento']??''));
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
        $sql="SELECT p.*,{$nombreSocio} AS socio,{$documentoSocio} AS documento,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='COBRO_SENA'),0) AS sena_cobrada,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='DEVOLUCION_SENA'),0) AS sena_devuelta,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='SENA_DONADA'),0) AS sena_donada,(SELECT COUNT(*) FROM medicamentos_prestamos_detalle d WHERE d.id_prestamo=p.id_prestamo) renglones,COALESCE((SELECT SUM(d.cantidad_entregada) FROM medicamentos_prestamos_detalle d WHERE d.id_prestamo=p.id_prestamo),0) AS unidades_entregadas,COALESCE((SELECT SUM(r.cantidad) FROM medicamentos_prestamos_devoluciones r INNER JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo WHERE d.id_prestamo=p.id_prestamo AND r.estado='APROBADA'),0) AS unidades_devueltas";
        $q=$db->prepare($sql.$from.$suffix.' ORDER BY p.id_prestamo DESC LIMIT ? OFFSET ?');
        foreach($params as $index=>$param)$q->bindValue($index+1,$param,PDO::PARAM_STR);
        $q->bindValue(count($params)+1,$perPage,PDO::PARAM_INT);
        $q->bindValue(count($params)+2,($page-1)*$perPage,PDO::PARAM_INT);
        $q->execute();
        return ['registros'=>$q->fetchAll(),'total'=>$total,'pagina'=>$page,'por_pagina'=>$perPage];
    }
    protected static function prestamoDatos(PDO $db,int $id): array {
        $q=$db->prepare("SELECT p.*,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio)) socio,COALESCE(NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento) documento FROM medicamentos_prestamos p LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio WHERE p.id_prestamo=?");
        $q->execute([$id]);$prestamo=$q->fetch();if(!$prestamo)api_error('Préstamo no encontrado.','NOT_FOUND',404);
        $q=$db->prepare("SELECT d.*,m.nombre_comercial,m.droga,m.dosis,
            COALESCE((SELECT SUM(r.cantidad) FROM medicamentos_prestamos_devoluciones r WHERE r.id_detalle_prestamo=d.id_detalle_prestamo),0) AS cantidad_recibida
            FROM medicamentos_prestamos_detalle d JOIN medicamentos m ON m.id_medicamento=d.id_medicamento WHERE d.id_prestamo=?");
        $q->execute([$id]);$detalle=$q->fetchAll();
        $q=$db->prepare('SELECT r.* FROM medicamentos_prestamos_devoluciones r JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo WHERE d.id_prestamo=? ORDER BY r.id_devolucion DESC');
        $q->execute([$id]);$devoluciones=$q->fetchAll();
        $q=$db->prepare('SELECT sm.*,mp.nombre AS medio_pago FROM medicamentos_prestamos_senas_movimientos sm LEFT JOIN medios_pago mp ON mp.id_medio_pago=sm.id_medio_pago WHERE sm.id_prestamo=? ORDER BY sm.id_movimiento_sena DESC');
        $q->execute([$id]);
        return ['prestamo'=>$prestamo,'detalle'=>$detalle,'devoluciones'=>$devoluciones,'senas'=>$q->fetchAll()];
    }
}
