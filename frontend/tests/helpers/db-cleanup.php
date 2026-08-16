<?php
declare(strict_types=1);

fwrite(
    STDERR,
    "Limpieza SQL directa deshabilitada. Playwright debe crear, consultar y limpiar datos E2E exclusivamente por la API protegida.\n"
);
exit(2);
