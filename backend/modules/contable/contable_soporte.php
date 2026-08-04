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
        $year = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => 2100]]);
        return $year === false ? (int)date('Y') : (int)$year;
    }

    protected static function filtroMes(mixed $value, bool $required = true): ?int
    {
        $text = trim((string)$value);
        if ($text === '' && !$required) return null;
        $month = filter_var($text, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
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

    protected static function opcion(PDO $db, int $id, string $expectedType, bool $activeOnly = true): array
    {
        $sql = 'SELECT id_opcion, tipo, nombre, activo FROM contable_opciones WHERE id_opcion = ?';
        if ($activeOnly) $sql .= ' AND activo = 1';
        $sql .= ' LIMIT 1';
        $statement = $db->prepare($sql);
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row || (string)$row['tipo'] !== $expectedType) {
            api_error('Una de las opciones seleccionadas ya no está disponible.', 'OPCION_CONTABLE_INVALIDA', 409);
        }
        return [
            'id_opcion' => (int)$row['id_opcion'],
            'tipo' => (string)$row['tipo'],
            'nombre' => (string)$row['nombre'],
            'activo' => (bool)$row['activo'],
        ];
    }

    protected static function medioPago(PDO $db, int $id): array
    {
        $statement = $db->prepare(
            "SELECT id_medio_pago, nombre, activo
             FROM medios_pago
             WHERE id_medio_pago = ? AND activo = 1 AND nombre <> 'CONDONACIÓN'
             LIMIT 1"
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

    protected static function catalogosBase(PDO $db): array
    {
        $options = $db->query(
            'SELECT id_opcion, tipo, nombre
             FROM contable_opciones
             WHERE activo = 1
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
            "SELECT id_medio_pago, nombre
             FROM medios_pago
             WHERE activo = 1 AND nombre <> 'CONDONACIÓN'
             ORDER BY nombre"
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
        $yearQueries = [
            "SELECT DISTINCT YEAR(fecha_pago) AS anio FROM pagos WHERE estado = 'PAGADO'",
            "SELECT DISTINCT YEAR(fecha_pago) AS anio FROM pagos_inscripciones WHERE estado = 'PAGADO'",
            "SELECT DISTINCT YEAR(fecha) AS anio FROM contable_ingresos WHERE estado = 'ACTIVO'",
            "SELECT DISTINCT YEAR(fecha) AS anio FROM contable_egresos WHERE estado = 'ACTIVO'",
        ];
        foreach ($yearQueries as $query) {
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

    protected static function allowedUploadPrefixes(): array
    {
        // t_1 se acepta para conservar adjuntos creados antes de quitar el modo SaaS.
        return [self::uploadFolder() . '/', 't_1/'];
    }

    protected static function validUploadPath(string $relativePath): bool
    {
        $cleanPath = ltrim($relativePath, '/\\');
        foreach (self::allowedUploadPrefixes() as $prefix) {
            if (str_starts_with($cleanPath, $prefix)) return true;
        }
        return false;
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

        $original = clean_text($file['name'] ?? 'COMPROBANTE', 255, false);
        return [
            'archivo_nombre_original' => $original,
            'archivo_nombre_guardado' => $stored,
            'archivo_mime' => $mime,
            'archivo_tamanio' => $size,
            'archivo_path' => self::uploadFolder() . '/' . $stored,
            'absolute_path' => $destination,
        ];
    }

    protected static function borrarArchivoFisico(array $auth, ?string $relativePath): void
    {
        if (!$relativePath) return;
        $cleanPath = ltrim($relativePath, '/\\');
        if (!self::validUploadPath($cleanPath)) return;
        $root = dirname(__DIR__, 2) . '/uploads/contable';
        $candidate = $root . '/' . $cleanPath;
        $realRoot = realpath($root);
        $realFile = realpath($candidate);
        if ($realRoot && $realFile && str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR) && is_file($realFile)) {
            @unlink($realFile);
        }
    }
}
