<?php
declare(strict_types=1);

/** Alertas operativas: nunca alteran stock, préstamos ni contabilidad.
 * Los descartes se guardan por usuario + entidad + fecha prevista.
 */
trait MedicamentosAlertas {
    protected static function alertasDatos(array $auth, array $filter): array {
        $tipo = strtoupper(trim((string)($filter['tipo'] ?? '')));
        if (!in_array($tipo, ['LOTE', 'PRESTAMO'], true)) api_error('Tipo de alerta inválido.');
        $db = $auth['db'];
        $hoy = date('Y-m-d');
        $limite = (new DateTimeImmutable($hoy))->modify('+30 days')->format('Y-m-d');
        if ($tipo === 'LOTE') {
            $sql = "SELECT 'LOTE' AS tipo, l.id_lote AS id_referencia, l.id_medicamento,
                l.numero_lote, l.estado AS estado_lote, l.cantidad_disponible,
                m.nombre_comercial AS titulo, m.dosis AS detalle,
                l.fecha_vencimiento AS fecha_objetivo,
                DATEDIFF(l.fecha_vencimiento, ?) AS dias_restantes
                FROM medicamentos_lotes l
                JOIN medicamentos m ON m.id_medicamento=l.id_medicamento
                WHERE m.activo=1 AND l.estado<>'DESCARTADO'
                  AND l.cantidad_disponible>0 AND l.fecha_vencimiento<=?
                  AND NOT EXISTS (
                    SELECT 1 FROM medicamentos_alertas_descartadas x
                    WHERE x.id_usuario=? AND x.tipo='LOTE'
                      AND x.id_referencia=l.id_lote
                      AND x.fecha_objetivo=l.fecha_vencimiento
                  )
                ORDER BY l.fecha_vencimiento ASC,l.id_lote ASC";
            $params = [$hoy, $limite, (int)$auth['id_usuario']];
        } else {
            $sql = "SELECT 'PRESTAMO' AS tipo, p.id_prestamo AS id_referencia,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ',sp.apellido,sp.nombre)),''),
                  NULLIF(se.razon_social,''),NULLIF(sdel.denominacion,''),
                  CONCAT('SOCIO #',p.id_socio)) AS titulo,
                p.fecha_entrega AS detalle, p.fecha_devolucion_prevista AS fecha_objetivo,
                DATEDIFF(p.fecha_devolucion_prevista, ?) AS dias_restantes
                FROM medicamentos_prestamos p
                LEFT JOIN socios_personas sp ON sp.id_socio=p.id_socio
                LEFT JOIN socios_empresas se ON se.id_socio=p.id_socio
                LEFT JOIN socios_eliminados sdel ON sdel.id_socio=p.id_socio
                WHERE p.estado='ABIERTO' AND p.fecha_devolucion_prevista IS NOT NULL
                  AND p.fecha_devolucion_prevista<=?
                  AND NOT EXISTS (
                    SELECT 1 FROM medicamentos_alertas_descartadas x
                    WHERE x.id_usuario=? AND x.tipo='PRESTAMO'
                      AND x.id_referencia=p.id_prestamo
                      AND x.fecha_objetivo=p.fecha_devolucion_prevista
                  )
                ORDER BY p.fecha_devolucion_prevista ASC,p.id_prestamo ASC";
            $params = [$hoy, $limite, (int)$auth['id_usuario']];
        }
        $query=$db->prepare($sql);
        $query->execute($params);
        return ['registros'=>$query->fetchAll(),'hoy'=>$hoy,'umbral_dias'=>30];
    }

    protected static function descartarAlertaDatos(array $auth, array $body): array {
        $tipo = strtoupper(trim((string)($body['tipo'] ?? '')));
        if (!in_array($tipo, ['LOTE','PRESTAMO'], true)) api_error('Tipo de alerta inválido.');
        $id = positive_id($body['id_referencia'] ?? null, 'alerta');
        $fecha = self::date($body['fecha_objetivo'] ?? '', 'fecha de alerta');
        $db=$auth['db'];
        // Validar la referencia y su fecha ACTUAL antes de suprimir nada.
        if ($tipo==='LOTE') {
            $q=$db->prepare("SELECT l.fecha_vencimiento AS fecha_objetivo FROM medicamentos_lotes l
                JOIN medicamentos m ON m.id_medicamento=l.id_medicamento
                WHERE l.id_lote=? AND m.activo=1 AND l.estado<>'DESCARTADO'
                AND l.cantidad_disponible>0");
        } else {
            $q=$db->prepare("SELECT fecha_devolucion_prevista AS fecha_objetivo FROM medicamentos_prestamos
                WHERE id_prestamo=? AND estado='ABIERTO' AND fecha_devolucion_prevista IS NOT NULL");
        }
        $q->execute([$id]);
        $actual=$q->fetchColumn();
        $limite=(new DateTimeImmutable(date('Y-m-d')))->modify('+30 days')->format('Y-m-d');
        if (!$actual || (string)$actual!==$fecha || $fecha>$limite) {
            api_error('La alerta ya no está vigente. Actualizá la sección.','STALE_ALERT',409);
        }
        $q=$db->prepare("INSERT INTO medicamentos_alertas_descartadas
          (id_usuario,tipo,id_referencia,fecha_objetivo) VALUES (?,?,?,?)
          ON DUPLICATE KEY UPDATE id_alerta=id_alerta");
        $q->execute([(int)$auth['id_usuario'],$tipo,$id,$fecha]);
        return ['descartada'=>true];
    }
}
