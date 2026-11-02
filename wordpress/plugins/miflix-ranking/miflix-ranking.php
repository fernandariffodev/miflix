<?php
/**
 * Plugin Name: MiFlix Ranking
 * Description: Tabla personalizada de vistas, endpoint REST del ranking y campos ACF para Películas, Series y Documentales.
 * Version: 1.0
 */

if (!defined('ABSPATH')) exit;

register_activation_hook(__FILE__, function () {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $tabla   = $wpdb->prefix . 'miflix_vistas';
    $charset = $wpdb->get_charset_collate();

    dbDelta("CREATE TABLE $tabla (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        titulo VARCHAR(190) NOT NULL,
        tipo VARCHAR(40) NOT NULL,
        vistas INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (id)
    ) $charset;");

    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM $tabla") === 0) miflix_sembrar();
});

add_action('rest_api_init', function () {
    register_rest_route('miflix/v1', '/ranking', [
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function () {
            global $wpdb;
            $tabla = $wpdb->prefix . 'miflix_vistas';
            $filas = $wpdb->get_results("SELECT titulo, tipo, vistas FROM $tabla ORDER BY vistas DESC LIMIT 10", ARRAY_A);
            return rest_ensure_response($filas);
        },
    ]);
});

add_action('acf/init', function () {
    if (!function_exists('acf_add_local_field_group')) return;

    $campo = function ($clave, $nombre, $etiqueta) {
        return [
            'key'                => 'field_miflix_' . $clave,
            'label'              => $etiqueta,
            'name'               => $nombre,
            'type'               => 'text',
            'show_in_graphql'    => 1,
            'graphql_field_name' => $nombre,
        ];
    };

    acf_add_local_field_group([
        'key'                => 'group_miflix_ficha',
        'title'              => 'Datos de la ficha',
        'fields'             => [
            $campo('anio',     'anio',     'Año'),
            $campo('genero',   'genero',   'Género'),
            $campo('director', 'director', 'Director'),
        ],
        'location'           => [
            [['param' => 'post_type', 'operator' => '==', 'value' => 'peliculas']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'series']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'documentales']],
        ],
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'camposFicha',
    ]);
});

add_action('graphql_register_types', function () {
    register_graphql_input_type('MiflixFichaInput', [
        'description' => 'Campos ACF de la ficha (año, género, director)',
        'fields'      => [
            'anio'     => ['type' => 'String'],
            'genero'   => ['type' => 'String'],
            'director' => ['type' => 'String'],
        ],
    ]);
});

add_filter('graphql_input_fields', function ($fields, $type_name) {
    $objetivos = [];
    foreach (['Pelicula', 'Serie', 'Documental'] as $s) {
        $objetivos[] = "Create{$s}Input";
        $objetivos[] = "Update{$s}Input";
    }
    if (in_array($type_name, $objetivos, true)) {
        $fields['camposFicha'] = ['type' => 'MiflixFichaInput'];
    }
    return $fields;
}, 10, 2);

add_action('graphql_post_object_mutation_update_additional_data', function ($post_id, $input) {
    if (empty($input['camposFicha']) || !function_exists('update_field')) return;
    $claves = ['anio' => 'field_miflix_anio', 'genero' => 'field_miflix_genero', 'director' => 'field_miflix_director'];
    foreach ($claves as $campo => $clave) {
        if (isset($input['camposFicha'][$campo])) {
            update_field($clave, sanitize_text_field($input['camposFicha'][$campo]), $post_id);
        }
    }
}, 10, 2);

add_filter('determine_current_user', function ($user) {
    if ($user) return $user;
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($uri, '/graphql') === false) return $user;

    $cab = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $cab, $m)) return $user;
    if (!defined('JWT_AUTH_SECRET_KEY') || !class_exists('\Firebase\JWT\JWT')) return $user;

    try {
        $payload = class_exists('\Firebase\JWT\Key')
            ? \Firebase\JWT\JWT::decode($m[1], new \Firebase\JWT\Key(JWT_AUTH_SECRET_KEY, 'HS256'))
            : \Firebase\JWT\JWT::decode($m[1], JWT_AUTH_SECRET_KEY, ['HS256']);
        if (isset($payload->data->user->id)) return (int) $payload->data->user->id;
    } catch (\Throwable $e) {

    }
    return $user;
}, 20);

function miflix_sembrar() {
    global $wpdb;
    $tabla = $wpdb->prefix . 'miflix_vistas';
    $wpdb->query("TRUNCATE TABLE $tabla");
    $ejemplos = [
        ['Interestelar',     'Película',    15230],
        ['Breaking Bad',     'Serie',       12840],
        ['Nuestro Planeta',  'Documental',   9410],
        ['El Padrino',       'Película',     8750],
        ['Stranger Things',  'Serie',        6320],
    ];
    foreach ($ejemplos as [$t, $tipo, $v]) {
        $wpdb->insert($tabla, ['titulo' => $t, 'tipo' => $tipo, 'vistas' => $v]);
    }
}
add_action('plugins_loaded', function () {
    global $wpdb;
    $tabla = $wpdb->prefix . 'miflix_vistas';
    if (get_option('miflix_seed_version') !== '2' && $wpdb->get_var("SHOW TABLES LIKE '$tabla'") === $tabla) {
        miflix_sembrar();
        update_option('miflix_seed_version', '2');
    }
});
