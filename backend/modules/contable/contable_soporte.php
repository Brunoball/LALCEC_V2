<?php
declare(strict_types=1);

trait ContableSoporte
{
    private const TIPOS_OPCION = [
        'PROVEEDOR',
        'CATEGORIA_INGRESO',
        'CONCEPTO_INGRESO',
        'CATEGORIA_EGRESO',
        'CONCEPTO_EGRESO',
    ];

    protected static function filtroAnio(mixed $value): int
    {
        $text = trim((string)$value);
        if ($text === '') return (int)date('Y');
        $year = filter_var($text, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 2000, 'max_range' => 2100],
        ]);
        if ($year === false) api_error('El año seleccionado no es válido.', 'FILTRO_INVALIDO');
        return (int)$year;
    }

    protected static function filtroMes(mixed $value, bool $required = true): ?int
    {
        $text = trim((string)$value);
        if ($text === '' && !$required) return null;
        $month = filter_var($text, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 12],
        ]);
        if ($month === false) api_error('El mes seleccionado no es válido.', 'FILTRO_INVALIDO');
        return (int)$month;
    }

    protected static function tipoOpcion(mixed $value): string
    {
        $type = clean_text($value, 40);
        if (!in_array($type, self::TIPOS_OPCION, true)) {
            api_error('El tipo de opción contable no es válido.', 'TIPO_OPCION_INVALIDO');
        }
        return $type;
    }

    protected static function opcion(PDO $db, int $id, string $expectedType): array
    {
        $statement = $db->prepare(
            'SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             WHERE id_opcion = ?
             LIMIT 1'
        );
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row || (string)$row['tipo'] !== $expectedType) {
            api_error('Una de las opciones seleccionadas ya no está disponible.', 'OPCION_CONTABLE_INVALIDA', 409);
        }
        return [
            'id_opcion' => (int)$row['id_opcion'],
            'tipo' => (string)$row['tipo'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    protected static function medioPago(PDO $db, int $id): array
    {
        $statement = $db->prepare(
            'SELECT id_medio_pago, nombre
             FROM medios_pago
             WHERE id_medio_pago = ? AND activo = 1
             LIMIT 1'
        );
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) api_error('El medio de pago seleccionado no está disponible.', 'MEDIO_PAGO_INVALIDO', 409);
        return [
            'id_medio_pago' => (int)$row['id_medio_pago'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    protected static function textoBusqueda(mixed $value): string
    {
        return clean_text($value, 160, false);
    }

    protected static function idOpcional(mixed $value, string $label): ?int
    {
        $text = trim((string)$value);
        return $text === '' ? null : positive_id($text, $label);
    }

    protected static function rangoAnio(int $year): array
    {
        return [sprintf('%04d-01-01', $year), sprintf('%04d-01-01', $year + 1)];
    }

    protected static function rangoMes(int $year, int $month): array
    {
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
        return [$start->format('Y-m-d'), $start->modify('+1 month')->format('Y-m-d')];
    }

    protected static function centavos(mixed $value): int
    {
        return (int)round((float)$value * 100, 0, PHP_ROUND_HALF_UP);
    }

    protected static function importeDesdeCentavos(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    protected static function nombreMes(int $month): string
    {
        return [
            1 => 'ENERO', 2 => 'FEBRERO', 3 => 'MARZO', 4 => 'ABRIL',
            5 => 'MAYO', 6 => 'JUNIO', 7 => 'JULIO', 8 => 'AGOSTO',
            9 => 'SEPTIEMBRE', 10 => 'OCTUBRE', 11 => 'NOVIEMBRE', 12 => 'DICIEMBRE',
        ][$month] ?? '';
    }

    protected static function importePagoSql(
        string $paymentAlias = 'p',
        string $partnerAlias = 's',
        string $categoryAlias = 'c'
    ): string {
        return "COALESCE(
            {$paymentAlias}.monto,
            (
                SELECT hp.monto_nuevo
                FROM categorias_historial_precios hp
                WHERE hp.id_categoria = {$partnerAlias}.id_categoria
                  AND DATE(hp.fecha_cambio) <= LAST_DAY(
                      STR_TO_DATE(CONCAT({$paymentAlias}.anio, '-', LPAD({$paymentAlias}.mes, 2, '0'), '-01'), '%Y-%m-%d')
                  )
                ORDER BY hp.fecha_cambio DESC, hp.id_historial_precio DESC
                LIMIT 1
            ),
            (
                SELECT hp0.monto_anterior
                FROM categorias_historial_precios hp0
                WHERE hp0.id_categoria = {$partnerAlias}.id_categoria
                ORDER BY hp0.fecha_cambio ASC, hp0.id_historial_precio ASC
                LIMIT 1
            ),
            {$categoryAlias}.monto_cuota,
            0
        )";
    }

    protected static function opcionConfiguracion(PDO $db, int $id, bool $lock = false): ?array
    {
        $suffix = $lock ? ' FOR UPDATE' : '';
        $statement = $db->prepare(
            'SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             WHERE id_opcion = ?' . $suffix
        );
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) return null;

        return [
            'id_opcion' => (int)$row['id_opcion'],
            'tipo' => (string)$row['tipo'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    protected static function opcionesConfiguracionDatos(PDO $db): array
    {
        $rows = $db->query(
            'SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             ORDER BY tipo ASC, nombre ASC, id_opcion ASC'
        )->fetchAll();

        $lists = [];
        $summary = [];
        foreach (self::TIPOS_OPCION as $type) {
            $lists[$type] = [];
            $summary[$type . '_total'] = 0;
        }

        foreach ($rows as $row) {
            $type = (string)$row['tipo'];
            $lists[$type][] = [
                'id_opcion' => (int)$row['id_opcion'],
                'tipo' => $type,
                'nombre' => (string)$row['nombre'],
            ];
            $summary[$type . '_total']++;
        }

        return ['listas' => $lists, 'resumen' => $summary];
    }

    protected static function catalogosBase(PDO $db): array
    {
        $options = $db->query(
            'SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             ORDER BY tipo, nombre'
        )->fetchAll();
        $grouped = [];
        foreach (self::TIPOS_OPCION as $type) $grouped[$type] = [];
        foreach ($options as $option) {
            $grouped[(string)$option['tipo']][] = [
                'id_opcion' => (int)$option['id_opcion'],
                'nombre' => (string)$option['nombre'],
            ];
        }

        $means = $db->query(
            'SELECT id_medio_pago, nombre
             FROM medios_pago
             WHERE activo = 1
             ORDER BY nombre'
        )->fetchAll();
        foreach ($means as &$mean) $mean['id_medio_pago'] = (int)$mean['id_medio_pago'];
        unset($mean);

        $partnerCategories = $db->query(
            'SELECT id_categoria, nombre, activo FROM categorias ORDER BY nombre'
        )->fetchAll();
        foreach ($partnerCategories as &$partnerCategory) {
            $partnerCategory['id_categoria'] = (int)$partnerCategory['id_categoria'];
            $partnerCategory['activo'] = (bool)$partnerCategory['activo'];
        }
        unset($partnerCategory);

        $years = [(int)date('Y') => (int)date('Y')];
        foreach ([
            'SELECT DISTINCT YEAR(fecha_pago) AS anio FROM pagos',
            'SELECT DISTINCT YEAR(fecha) AS anio FROM contable_ingresos',
            'SELECT DISTINCT YEAR(fecha) AS anio FROM contable_egresos',
        ] as $query) {
            foreach ($db->query($query)->fetchAll() as $row) {
                $year = (int)($row['anio'] ?? 0);
                if ($year >= 2000 && $year <= 2100) $years[$year] = $year;
            }
        }
        rsort($years, SORT_NUMERIC);

        return [
            'opciones' => $grouped,
            'medios_pago' => $means,
            'categorias_socios' => $partnerCategories,
            'anios' => array_values($years),
            'meses' => array_map(static fn(int $month): array => [
                'numero' => $month,
                'nombre' => self::nombreMes($month),
            ], range(1, 12)),
        ];
    }

    protected static function uploadFolder(): string
    {
        $folder = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)env_value('APP_UPLOAD_FOLDER', 'lalcec')) ?? 'lalcec';
        $folder = trim($folder, '-_');
        return $folder !== '' ? $folder : 'lalcec';
    }

    protected static function validUploadPath(string $relativePath): bool
    {
        $cleanPath = ltrim($relativePath, '/\\');
        return str_starts_with($cleanPath, self::uploadFolder() . '/');
    }

    protected static function uploadRoot(array $auth): string
    {
        return dirname(__DIR__, 2) . '/uploads/contable/' . self::uploadFolder();
    }

    protected static function guardarArchivoEgreso(array $auth): ?array
    {
        if (!isset($_FILES['archivo']) || !is_array($_FILES['archivo'])) return null;
        $file = $_FILES['archivo'];
        $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) return null;
        if ($error !== UPLOAD_ERR_OK) api_error('No se pudo cargar el comprobante.', 'ARCHIVO_UPLOAD_ERROR');

        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > 10 * 1024 * 1024) {
            api_error('El comprobante debe pesar como máximo 10 MB.', 'ARCHIVO_DEMASIADO_GRANDE');
        }

        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) api_error('El archivo recibido no es válido.', 'ARCHIVO_INVALIDO');

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($tmp);
        $allowed = [
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
        ];
        if (!isset($allowed[$mime])) {
            api_error('Solo se permiten archivos PDF, JPG, PNG, GIF o WEBP.', 'TIPO_ARCHIVO_INVALIDO');
        }

        $root = self::uploadRoot($auth);
        if (!is_dir($root) && !mkdir($root, 0775, true) && !is_dir($root)) {
            api_error('No se pudo preparar la carpeta de comprobantes.', 'ARCHIVO_DIRECTORIO_ERROR', 500);
        }

        $stored = date('YmdHis') . '-' . bin2hex(random_bytes(10)) . '.' . $allowed[$mime];
        $destination = $root . '/' . $stored;
        if (!move_uploaded_file($tmp, $destination)) {
            api_error('No se pudo guardar el comprobante en el servidor.', 'ARCHIVO_GUARDADO_ERROR', 500);
        }

        return [
            'archivo_path' => self::uploadFolder() . '/' . $stored,
            'absolute_path' => $destination,
        ];
    }

    protected static function borrarArchivoFisico(array $auth, ?string $relativePath): void
    {
        $path = trim((string)$relativePath);
        if ($path === '' || !self::validUploadPath($path)) return;
        $root = dirname(__DIR__, 2) . '/uploads/contable';
        $candidate = $root . '/' . ltrim($path, '/\\');
        $realRoot = realpath($root);
        $realFile = realpath($candidate);
        if ($realRoot && $realFile && str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR) && is_file($realFile)) {
            @unlink($realFile);
        }
    }
}
