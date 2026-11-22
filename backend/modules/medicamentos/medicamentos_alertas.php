<?php
declare(strict_types=1);

/** Alertas operativas: nunca alteran stock, préstamos ni contabilidad.
 * Los descartes se guardan por usuario + entidad + fecha objetivo.
 *
 * Préstamos (Trello: "al mes en amarillo y 3 meses en rojo"):
 * - Solo préstamos ABIERTOS con unidades pendientes de devolución.
 * - ROJA: se cumplieron 3 meses calendario desde la entrega.
 * - AMARILLA: se cumplió 1 mes calendario (y todavía no 3).
 * - PREVISTA: aviso histórico por fecha prevista de devolución (vencida o dentro
 *   de 30 días), solo mientras el préstamo no tiene alerta por antigüedad.
 * Cada préstamo aparece una sola vez. La fecha objetivo de AMARILLA es
 * entrega+1 mes y la de ROJA entrega+3 meses: descartar la amarilla no impide
 * que la roja aparezca después.
 */
trait MedicamentosAlertas {
    protected static function alertasDatos(array $auth, array $filter): array {
        $tipo=strtoupper(trim((string)($filter['tipo']??'')));
        if(!in_array($tipo,['PRESTAMO','MEDICAMENTO'],true))api_error('Tipo de alerta inválido.');
        $db=$auth['db'];$hoy=date('Y-m-d');
        $limite=(new DateTimeImmutable($hoy))->modify('+30 days')->format('Y-m-d');
        if($tipo==='MEDICAMENTO'){
            $q=$db->prepare("SELECT 'MEDICAMENTO' AS tipo,m.id_medicamento AS id_referencia,
                m.nombre_comercial AS titulo,CONCAT(m.droga,' · ',m.presentacion,' · Stock: ',m.stock_actual) AS detalle,
                m.fecha_vencimiento AS fecha_objetivo,DATEDIFF(m.fecha_vencimiento,?) AS dias_restantes
                FROM medicamentos m
                WHERE m.activo=1 AND m.stock_actual>0 AND m.fecha_vencimiento IS NOT NULL
                  AND m.fecha_vencimiento<=? AND NOT EXISTS (
                    SELECT 1 FROM medicamentos_alertas_descartadas x
                    WHERE x.id_usuario=? AND x.tipo='MEDICAMENTO'
                      AND x.id_referencia=m.id_medicamento AND x.fecha_objetivo=m.fecha_vencimiento)
                ORDER BY m.fecha_vencimiento,m.id_medicamento");
            $q->execute([$hoy,$limite,(int)$auth['id_usuario']]);
            return ['registros'=>$q->fetchAll(),'hoy'=>$hoy,'umbral_dias'=>30];
        }
        $usuario=(int)$auth['id_usuario'];
        $registros=[];
        foreach(self::prestamosConAlertaCandidata($db,$hoy,$limite,$usuario) as $p){
            $alerta=self::alertaPrestamoVigente($p,$hoy,$limite,true);
            if($alerta===null) continue;
            [$nivel,$objetivo]=$alerta;
            $registros[]=[
                'tipo'=>'PRESTAMO',
                'id_referencia'=>(int)$p['id_prestamo'],
                'titulo'=>$p['titulo'],
                'detalle'=>$p['fecha_entrega'],
                'nivel'=>$nivel,
                'fecha_objetivo'=>$objetivo,
                'dias_restantes'=>(int)(new DateTimeImmutable($hoy))->diff(new DateTimeImmutable($objetivo))->format('%r%a'),
                'fecha_entrega'=>substr((string)$p['fecha_entrega'],0,10),
                'fecha_devolucion_prevista'=>$p['fecha_devolucion_prevista'],
                'dias_prestado'=>(int)$p['dias_prestado'],
                'unidades_pendientes'=>(int)$p['pendientes'],
            ];
        }
        $orden=['ROJA'=>0,'AMARILLA'=>1,'PREVISTA'=>2];
        usort($registros,static fn($a,$b)=>[$orden[$a['nivel']],$a['fecha_objetivo'],$a['id_referencia']]<=>[$orden[$b['nivel']],$b['fecha_objetivo'],$b['id_referencia']]);
        return ['registros'=>$registros,'hoy'=>$hoy,'umbral_dias'=>30,'meses_amarilla'=>1,'meses_roja'=>3];
    }

    /**
     * Préstamos abiertos, con pendientes, que tienen alguna alerta posible y las
     * marcas de descarte del usuario. $usuario=null omite las marcas.
     */
    private static function prestamosConAlertaCandidata(PDO $db,string $hoy,string $limite,?int $usuario,?int $id=null): array {
        $pend=self::pendientesPrestamoSql();
        // Con prepares nativos (sin emulación) cada marcador con nombre se usa una sola vez.
        $descartada=static fn(string $fecha,string $marca): string => $usuario===null ? '0' :
            "EXISTS (SELECT 1 FROM medicamentos_alertas_descartadas x WHERE x.id_usuario=:{$marca} AND x.tipo='PRESTAMO'
                AND x.id_referencia=p.id_prestamo AND x.fecha_objetivo={$fecha})";
        $f1="DATE_ADD(DATE(p.fecha_entrega),INTERVAL 1 MONTH)";
        $f3="DATE_ADD(DATE(p.fecha_entrega),INTERVAL 3 MONTH)";
        $sql="SELECT * FROM (SELECT p.id_prestamo,p.fecha_entrega,p.fecha_devolucion_prevista,
              COALESCE(NULLIF(TRIM(CONCAT_WS(', ',NULLIF(TRIM(p.apellido_receptor),''),NULLIF(TRIM(p.nombre_receptor),''))),''),NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),CONCAT('SOCIO #',p.id_socio)) AS titulo,
              {$pend} AS pendientes,
              DATEDIFF(:hoy1,DATE(p.fecha_entrega)) AS dias_prestado,
              {$f1} AS fecha_amarilla,{$f3} AS fecha_roja,
              ".$descartada($f1,'usuario1')." AS descartada_amarilla,
              ".$descartada($f3,'usuario2')." AS descartada_roja,
              ".$descartada('p.fecha_devolucion_prevista','usuario3')." AS descartada_prevista
            FROM medicamentos_prestamos p
            LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio
            LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio
            LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio
            WHERE p.estado='ABIERTO'".($id!==null?' AND p.id_prestamo=:id':'')."
              AND ({$f1}<=:hoy2 OR (p.fecha_devolucion_prevista IS NOT NULL AND p.fecha_devolucion_prevista<=:limite))
            ) t WHERE t.pendientes>0 ORDER BY t.id_prestamo";
        $q=$db->prepare($sql);
        $q->bindValue(':hoy1',$hoy);$q->bindValue(':hoy2',$hoy);$q->bindValue(':limite',$limite);
        if($usuario!==null)foreach(['usuario1','usuario2','usuario3'] as $marca)$q->bindValue(':'.$marca,$usuario,PDO::PARAM_INT);
        if($id!==null)$q->bindValue(':id',$id,PDO::PARAM_INT);
        $q->execute();
        return $q->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Devuelve [nivel, fecha_objetivo] de la alerta vigente de un préstamo, o null.
     * Con $respetarDescartes=false devuelve la alerta aplicable aunque el usuario la haya descartado.
     */
    private static function alertaPrestamoVigente(array $p,string $hoy,string $limite,bool $respetarDescartes): ?array {
        $roja=(string)$p['fecha_roja'];$amarilla=(string)$p['fecha_amarilla'];
        if($roja<=$hoy)
            return ($respetarDescartes && (int)$p['descartada_roja']) ? null : ['ROJA',$roja];
        if($amarilla<=$hoy)
            return ($respetarDescartes && (int)$p['descartada_amarilla']) ? null : ['AMARILLA',$amarilla];
        $prevista=$p['fecha_devolucion_prevista']===null?null:substr((string)$p['fecha_devolucion_prevista'],0,10);
        if($prevista!==null && $prevista<=$limite && !($respetarDescartes && (int)$p['descartada_prevista']))
            return ['PREVISTA',$prevista];
        return null;
    }

    protected static function descartarAlertaDatos(array $auth,array $body): array {
        $tipo=strtoupper(trim((string)($body['tipo']??'')));
        if(!in_array($tipo,['PRESTAMO','MEDICAMENTO'],true))api_error('Alerta inválida.');
        $id=positive_id($body['id_referencia']??null,'alerta');
        $fecha=self::date($body['fecha_objetivo']??'','fecha de alerta');
        $db=$auth['db'];
        $hoy=date('Y-m-d');
        $limite=(new DateTimeImmutable($hoy))->modify('+30 days')->format('Y-m-d');
        if($tipo==='MEDICAMENTO'){
            $q=$db->prepare('SELECT fecha_vencimiento FROM medicamentos WHERE id_medicamento=? AND activo=1 AND stock_actual>0 AND fecha_vencimiento IS NOT NULL');
            $q->execute([$id]);$actual=$q->fetchColumn();
            if(!$actual || (string)$actual!==$fecha || $fecha>$limite)api_error('La alerta ya no está vigente.','STALE_ALERT',409);
        } else {
            // Solo se descarta la alerta que corresponde HOY al préstamo (amarilla,
            // roja o fecha prevista); una fecha distinta se considera desactualizada.
            $filas=self::prestamosConAlertaCandidata($db,$hoy,$limite,null,$id);
            $vigente=$filas ? self::alertaPrestamoVigente($filas[0],$hoy,$limite,false) : null;
            if($vigente===null || $vigente[1]!==$fecha)api_error('La alerta ya no está vigente.','STALE_ALERT',409);
        }
        $q=$db->prepare("INSERT INTO medicamentos_alertas_descartadas (id_usuario,tipo,id_referencia,fecha_objetivo)
          VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id_alerta=id_alerta");
        $q->execute([(int)$auth['id_usuario'],$tipo,$id,$fecha]);
        return ['descartada'=>true];
    }
}
