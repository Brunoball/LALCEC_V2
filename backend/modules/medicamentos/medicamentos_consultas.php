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
            WHEN mov.tipo='SALIDA_VENTA' AND mov.id_ingreso_contable IS NULL AND mov.origen='ENTREGA COBRADA'
                THEN 'Forma parte de una entrega cobrada de Tratamiento del dolor: su cobro es único para toda la entrega y no se anula por renglón.'
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
    /** Tratamiento del dolor: entregas sin cargo, sin préstamos ni operaciones de otros sectores.
     * Registros históricos de una entrega sin receptor conservan procedencia NULL.
     * Se filtra en SQL antes de paginar, nunca sólo en el navegador.
     */
    /**
     * Historial de Entregas de Tratamiento del dolor:
     * - Entregas agrupadas (medicamentos_entregas): cantidades netas de las correcciones.
     *   Solo las históricas cobradas conservan importe y medio de pago.
     * - Entregas históricas sin cargo (ENTREGA_DONACION de presentaciones de Dolor):
     *   se conservan visibles, una fila por movimiento, con su significado original.
     */
    protected static function entregasDolorDatos(PDO $db, array $filter): array {
        $pagina=max(1,min(100000,(int)($filter['pagina']??1)));$porPagina=20;
        $buscar=trim((string)($filter['buscar']??''));
        $buscar=function_exists('mb_substr') ? mb_substr($buscar,0,80,'UTF-8') : substr($buscar,0,80);
        $dolor=MedicamentosOpciones::presentacionesDolorSql($db);
        $like='%'.$buscar.'%';
        $historicas="SELECT 'HISTORICA' AS tipo_registro,mov.id_movimiento AS id_registro,mov.id_movimiento,NULL AS id_entrega,
                mov.fecha_movimiento,mov.procedencia AS receptor,NULL AS paciente_nombre,NULL AS dni_receptor,NULL AS celular_receptor,
                NULL AS importe,NULL AS medio_pago,mov.detalle,mov.cantidad,m.nombre_comercial,m.droga,m.presentacion,m.unidad_stock,
                NULL AS paciente_dni,NULL AS nombre_receptor,NULL AS apellido_receptor,NULL AS revision
            FROM medicamentos_movimientos mov JOIN medicamentos m ON m.id_medicamento=mov.id_medicamento
            WHERE mov.tipo='ENTREGA_DONACION' AND m.presentacion IN ({$dolor})";
        if(self::entregasCobradasDisponibles($db))$historicas.=' AND mov.id_entrega IS NULL';
        $params=[];
        if($buscar!==''){
            $historicas.=" AND (m.nombre_comercial LIKE ? OR m.droga LIKE ? OR mov.procedencia LIKE ?)";
            array_push($params,$like,$like,$like);
        }
        $union=$historicas;
        if(self::entregasCobradasDisponibles($db)){
            $revision=self::entregasGratuitasDisponibles($db)?'e.revision':'NULL';
            $cobradas="SELECT CASE WHEN e.importe=0 AND e.id_ingreso_contable IS NULL AND e.id_medio_pago IS NULL THEN 'GRATUITA' ELSE 'COBRADA' END,e.id_entrega,NULL,e.id_entrega,e.fecha,
                    TRIM(CONCAT_WS(' ',e.nombre_receptor,e.apellido_receptor)),e.paciente_nombre,e.dni_receptor,e.celular_receptor,
                    e.importe,mp.nombre,e.observaciones,
                    (SELECT COALESCE(-SUM(x.variacion_disponible),0) FROM medicamentos_movimientos x WHERE x.id_entrega=e.id_entrega),
                    NULL,NULL,NULL,NULL,e.paciente_dni,e.nombre_receptor,e.apellido_receptor,{$revision}
                FROM medicamentos_entregas e LEFT JOIN medios_pago mp ON mp.id_medio_pago=e.id_medio_pago";
            if($buscar!==''){
                $cobradas.=" WHERE (e.nombre_receptor LIKE ? OR e.apellido_receptor LIKE ? OR e.paciente_nombre LIKE ?
                    OR e.paciente_dni LIKE ? OR e.dni_receptor LIKE ?
                    OR EXISTS (SELECT 1 FROM medicamentos_movimientos x JOIN medicamentos mx ON mx.id_medicamento=x.id_medicamento
                        WHERE x.id_entrega=e.id_entrega AND (mx.nombre_comercial LIKE ? OR mx.droga LIKE ?) GROUP BY x.id_medicamento HAVING SUM(x.variacion_disponible)<0))";
                array_push($params,...array_fill(0,7,$like));
            }
            $union.=' UNION ALL '.$cobradas;
        }
        $q=$db->prepare("SELECT COUNT(*) FROM ({$union}) t");$q->execute($params);$total=(int)$q->fetchColumn();
        $pagina=min($pagina,max(1,(int)ceil($total/$porPagina)));
        $q=$db->prepare("SELECT * FROM ({$union}) t ORDER BY t.fecha_movimiento DESC,t.id_registro DESC LIMIT ? OFFSET ?");
        foreach($params as $i=>$valor)$q->bindValue($i+1,$valor,PDO::PARAM_STR);
        $q->bindValue(count($params)+1,$porPagina,PDO::PARAM_INT);
        $q->bindValue(count($params)+2,($pagina-1)*$porPagina,PDO::PARAM_INT);
        $q->execute();
        $registros=$q->fetchAll(PDO::FETCH_ASSOC);
        // Cantidades netas de cada entrega agrupada (consulta única para la página).
        $ids=array_values(array_map(static fn($r)=>(int)$r['id_entrega'],array_filter($registros,static fn($r)=>$r['id_entrega']!==null)));
        $items=[];
        if($ids){
            $q=$db->prepare('SELECT x.id_entrega,MIN(x.id_movimiento) id_movimiento,x.id_medicamento,-SUM(x.variacion_disponible) cantidad,m.nombre_comercial,m.presentacion,m.unidad_stock
                FROM medicamentos_movimientos x JOIN medicamentos m ON m.id_medicamento=x.id_medicamento
                WHERE x.id_entrega IN ('.implode(',',array_fill(0,count($ids),'?')).') GROUP BY x.id_entrega,x.id_medicamento,m.nombre_comercial,m.presentacion,m.unidad_stock HAVING SUM(x.variacion_disponible)<0 ORDER BY MIN(x.id_movimiento)');
            $q->execute($ids);
            foreach($q->fetchAll(PDO::FETCH_ASSOC) as $it)$items[(int)$it['id_entrega']][]=$it;
        }
        foreach($registros as &$r){
            if($r['id_entrega']!==null){
                $r['items']=$items[(int)$r['id_entrega']]??[];
            } else {
                $r['items']=[['id_movimiento'=>$r['id_movimiento'],'cantidad'=>$r['cantidad'],'nombre_comercial'=>$r['nombre_comercial'],
                    'presentacion'=>$r['presentacion'],'unidad_stock'=>$r['unidad_stock']]];
            }
        }
        unset($r);
        return ['registros'=>$registros,'total'=>$total,'pagina'=>$pagina,'por_pagina'=>$porPagina];
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
    /** Unidades entregadas menos devueltas del préstamo `p` (mismo criterio que la validación de devolución). */
    protected static function pendientesPrestamoSql(): string {
        return "(COALESCE((SELECT SUM(dx.cantidad_entregada) FROM medicamentos_prestamos_detalle dx WHERE dx.id_prestamo=p.id_prestamo),0)
            -COALESCE((SELECT SUM(rx.cantidad) FROM medicamentos_prestamos_devoluciones rx JOIN medicamentos_prestamos_detalle dr ON dr.id_detalle_prestamo=rx.id_detalle_prestamo WHERE dr.id_prestamo=p.id_prestamo),0))";
    }
    /**
     * Nivel de alerta por antigüedad (meses calendario desde la entrega) para
     * préstamos ABIERTOS con unidades pendientes: AMARILLA al mes, ROJA a los 3.
     * $hoy se calcula en PHP para que la zona horaria sea la misma que la de fecha_entrega.
     */
    protected static function nivelAntiguedadSql(PDO $db,string $hoy): string {
        $h=$db->quote($hoy);
        $pend=self::pendientesPrestamoSql();
        return "CASE WHEN p.estado='ABIERTO' AND {$pend}>0 THEN
            CASE WHEN DATE_ADD(DATE(p.fecha_entrega),INTERVAL 3 MONTH)<={$h} THEN 'ROJA'
                 WHEN DATE_ADD(DATE(p.fecha_entrega),INTERVAL 1 MONTH)<={$h} THEN 'AMARILLA' END END";
    }
    /** Saldo de seña: cobrado − reintegrado − donado (idéntico a cierre y reintegro). */
    protected static function senaPendienteSql(): string {
        return "GREATEST(0,COALESCE((SELECT SUM(CASE WHEN sx.tipo='COBRO_SENA' THEN sx.monto ELSE -sx.monto END) FROM medicamentos_prestamos_senas_movimientos sx WHERE sx.id_prestamo=p.id_prestamo),0))";
    }
    protected static function prestamosDatos(PDO $db,array $filter): array {
        $status=(string)($filter['estado']??'');
        $search=trim((string)($filter['buscar']??''));
        $search=function_exists('mb_substr')?mb_substr($search,0,90,'UTF-8'):substr($search,0,90);
        $page=max(1,min(100000,(int)($filter['pagina']??1)));$perPage=20;
        $nuevas=self::columnasPacienteDisponibles($db);
        $from=" FROM medicamentos_prestamos p LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio";
        $nombreSocio="COALESCE(NULLIF(TRIM(CONCAT_WS(' ',p.nombre_receptor,p.apellido_receptor)),''),NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio))";
        $documentoSocio=$nuevas
            ? "COALESCE(NULLIF(p.dni_receptor,''),NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento)"
            : "COALESCE(NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento)";
        $where=[];$params=[];
        if(in_array($status,['ABIERTO','CERRADO','ANULADO'],true)){$where[]='p.estado=?';$params[]=$status;}
        if($search!==''){
            $extra=$nuevas?' OR p.paciente_nombre LIKE ? OR p.paciente_dni LIKE ?':'';
            $where[]="({$nombreSocio} LIKE ? OR {$documentoSocio} LIKE ? OR CAST(p.id_prestamo AS CHAR) LIKE ?{$extra})";
            array_push($params,...array_fill(0,$nuevas?5:3,'%'.$search.'%'));
        }
        $suffix=$where?' WHERE '.implode(' AND ',$where):'';
        $q=$db->prepare('SELECT COUNT(*)'.$from.$suffix);$q->execute($params);$total=(int)$q->fetchColumn();
        $page=min($page,max(1,(int)ceil($total/$perPage)));
        $sql="SELECT p.*,{$nombreSocio} AS socio,{$documentoSocio} AS documento,".self::senaPendienteSql()." AS sena_pendiente,(".self::nivelAntiguedadSql($db,date('Y-m-d')).") AS alerta_devolucion,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='COBRO_SENA'),0) AS sena_cobrada,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='DEVOLUCION_SENA'),0) AS sena_devuelta,COALESCE((SELECT SUM(s.monto) FROM medicamentos_prestamos_senas_movimientos s WHERE s.id_prestamo=p.id_prestamo AND s.tipo='SENA_DONADA'),0) AS sena_donada,(SELECT COUNT(*) FROM medicamentos_prestamos_detalle d WHERE d.id_prestamo=p.id_prestamo) renglones,COALESCE((SELECT SUM(d.cantidad_entregada) FROM medicamentos_prestamos_detalle d WHERE d.id_prestamo=p.id_prestamo),0) AS unidades_entregadas,COALESCE((SELECT SUM(r.cantidad) FROM medicamentos_prestamos_devoluciones r INNER JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo WHERE d.id_prestamo=p.id_prestamo AND r.estado='APROBADA'),0) AS unidades_devueltas";
        $q=$db->prepare($sql.$from.$suffix.' ORDER BY p.id_prestamo DESC LIMIT ? OFFSET ?');
        foreach($params as $index=>$param)$q->bindValue($index+1,$param,PDO::PARAM_STR);
        $q->bindValue(count($params)+1,$perPage,PDO::PARAM_INT);
        $q->bindValue(count($params)+2,($page-1)*$perPage,PDO::PARAM_INT);
        $q->execute();
        return ['registros'=>$q->fetchAll(),'total'=>$total,'pagina'=>$page,'por_pagina'=>$perPage];
    }
    protected static function prestamoDatos(PDO $db,int $id): array {
        // socio/documento conservan su significado histórico (persona que retira o
        // socio vinculado). Los datos manuales del paciente viajan en p.* tras la migración.
        $q=$db->prepare("SELECT p.*,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',p.nombre_receptor,p.apellido_receptor)),''),NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio)) socio,COALESCE(NULLIF(sp.dni,''),NULLIF(se.cuit,''),sdel.documento) documento,
            ".self::senaPendienteSql()." AS sena_pendiente,(".self::nivelAntiguedadSql($db,date('Y-m-d')).") AS alerta_devolucion
            FROM medicamentos_prestamos p LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio WHERE p.id_prestamo=?");
        $q->execute([$id]);$prestamo=$q->fetch();if(!$prestamo)api_error('Préstamo no encontrado.','NOT_FOUND',404);
        $q=$db->prepare("SELECT d.*,m.nombre_comercial,m.droga,m.dosis,m.unidad_dosis,m.unidad_stock,
            COALESCE((SELECT SUM(r.cantidad) FROM medicamentos_prestamos_devoluciones r WHERE r.id_detalle_prestamo=d.id_detalle_prestamo),0) AS cantidad_recibida
            FROM medicamentos_prestamos_detalle d JOIN medicamentos m ON m.id_medicamento=d.id_medicamento WHERE d.id_prestamo=? ORDER BY d.id_detalle_prestamo");
        $q->execute([$id]);$detalle=$q->fetchAll();
        // Cada devolución identifica el medicamento al que corresponde.
        $q=$db->prepare('SELECT r.*,d.id_medicamento,m.nombre_comercial,m.dosis,m.unidad_dosis,m.unidad_stock FROM medicamentos_prestamos_devoluciones r JOIN medicamentos_prestamos_detalle d ON d.id_detalle_prestamo=r.id_detalle_prestamo JOIN medicamentos m ON m.id_medicamento=d.id_medicamento WHERE d.id_prestamo=? ORDER BY r.id_devolucion DESC');
        $q->execute([$id]);$devoluciones=$q->fetchAll();
        $q=$db->prepare('SELECT sm.*,mp.nombre AS medio_pago FROM medicamentos_prestamos_senas_movimientos sm LEFT JOIN medios_pago mp ON mp.id_medio_pago=sm.id_medio_pago WHERE sm.id_prestamo=? ORDER BY sm.id_movimiento_sena DESC');
        $q->execute([$id]);
        return ['prestamo'=>$prestamo,'detalle'=>$detalle,'devoluciones'=>$devoluciones,'senas'=>$q->fetchAll()];
    }
}
