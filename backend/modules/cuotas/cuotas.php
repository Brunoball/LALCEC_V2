<?php
declare(strict_types=1);

require_once __DIR__ . '/cuotas_registros.php';

final class Cuotas extends CuotasRegistros
{
    public static function listar(): never
    {
        $auth = auth_context();
        api_success(self::listarDatos($auth['db'], $_GET));
    }

    public static function catalogos(): never
    {
        $auth = auth_context();
        api_success(self::catalogosDatos($auth['db']));
    }

    public static function detalleSocio(): never
    {
        $auth = auth_context();
        $id = positive_id($_GET['id'] ?? null, 'socio');
        api_success(self::detalleSocioDatos($auth['db'], $id));
    }

    public static function registrarCobro(): never
    {
        $auth = require_admin();
        $result = self::registrarCobroDatos($auth, request_body());
        $combined = $result['incluye_cuotas'] && $result['incluye_inscripcion'];
        api_success(
            $result,
            $result['estado'] === 'CONDONADO'
                ? ($combined
                    ? 'Cuotas e inscripción condonadas correctamente.'
                    : 'Condonación registrada correctamente.')
                : ($combined
                    ? 'Cuotas e inscripción pagadas en una sola operación.'
                    : 'Pago registrado correctamente.')
        );
    }

    public static function registrarPago(): never
    {
        $auth = require_admin();
        $result = self::registrarPagoDatos($auth, request_body());
        api_success($result, $result['estado'] === 'CONDONADO'
            ? 'Condonación registrada correctamente.'
            : 'Pago registrado correctamente.');
    }

    public static function registrarInscripcion(): never
    {
        $auth = require_admin();
        $result = self::registrarInscripcionDatos($auth, request_body());
        api_success($result, $result['estado'] === 'CONDONADO'
            ? 'Condonación de inscripción registrada correctamente.'
            : 'Pago de inscripción registrado correctamente.');
    }

    public static function anular(): never
    {
        $auth = require_admin();
        $result = self::anularDatos($auth, request_body());
        api_success($result, 'Registro eliminado correctamente. Los períodos volvieron a quedar pendientes.');
    }

    public static function comprobante(): never
    {
        $auth = auth_context();
        $code = clean_text($_GET['codigo'] ?? '', 64, false);
        if ($code === '') api_error('Falta el código de operación.', 'VALIDATION_ERROR');
        $operation = self::operacionPorCodigo($auth['db'], $code);
        if (!$operation) api_error('El comprobante solicitado no existe.', 'COMPROBANTE_NO_ENCONTRADO', 404);
        api_success([
            'organizacion' => $auth['organizacion']['nombre'],
            'operacion' => $operation,
        ]);
    }
}
