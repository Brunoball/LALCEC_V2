<?php
declare(strict_types=1);

require_once __DIR__ . '/testing_cleanup.php';

function register_testing_cleanup_routes(Router $router): void
{
    $router->register('e2e_cleanup', 'POST', [TestingCleanup::class, 'run'], true);
    $router->register('e2e_cleanup_scope', 'POST', [TestingCleanup::class, 'cleanupScope'], true);
    $router->register('e2e_guard_probe', 'POST', [TestingCleanup::class, 'guardProbe'], true);
    $router->register('e2e_auditoria', 'GET', [TestingCleanup::class, 'audit'], true);
    $router->register('e2e_status', 'GET', [TestingCleanup::class, 'status'], true);
    $router->register('e2e_snapshot', 'GET', [TestingCleanup::class, 'snapshot'], true);
}
