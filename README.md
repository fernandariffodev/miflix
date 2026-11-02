# MiFlix

Cartelera de películas, series y documentales con un front-end propio que consume WordPress como CMS headless. Desarrollado para una asignatura de la carrera de Desarrollo y Diseño Web (Duoc UC).

**Sitio en vivo:** https://fernriffor.laboratoriodiseno.cl/cartelera_final/

## Funcionalidades

- Catálogo de películas, series y documentales cargado desde WordPress mediante **GraphQL** (WPGraphQL).
- Buscador por título, año, género o descripción; filtros por tipo y género, y orden personalizable.
- Carruseles por categoría con Swiper.
- Sección **"Más vistas"**, alimentada por un endpoint REST propio (`/wp-json/miflix/v1/ranking`).
- Inicio de sesión con **JWT**. Con sesión iniciada se pueden agregar, editar y eliminar títulos desde el mismo sitio.

## Tecnologías

- Front-end: HTML, CSS, JavaScript, jQuery 3.7.1 y Swiper 11
- Back-end: WordPress headless con WPGraphQL, WPGraphQL for ACF, Advanced Custom Fields, Custom Post Type UI y JWT Authentication for WP REST API
- Plugin propio: **MiFlix Ranking** (PHP)

## Estructura

```
miflix/
├── frontend/
│   ├── index.html
│   ├── app.js        # Configuración, consultas GraphQL, filtros, login JWT y CRUD
│   └── styles.css
└── wordpress/
    └── plugins/
        └── miflix-ranking/
            └── miflix-ranking.php
```

### Plugin MiFlix Ranking

- Crea la tabla `{prefijo}_miflix_vistas` al activarse y la llena con datos de ejemplo.
- Registra el endpoint `GET /wp-json/miflix/v1/ranking`, que devuelve los 10 títulos con más vistas.
- Define en código los campos ACF de las fichas (año, género, etc.) y los expone en GraphQL, incluido su guardado mediante mutaciones.
- Valida el token JWT del encabezado `Authorization` para identificar al usuario en las peticiones.

## Instalación

1. En WordPress, instalar y activar WPGraphQL, WPGraphQL for ACF, Advanced Custom Fields, Custom Post Type UI y JWT Authentication for WP REST API.
2. Crear los Custom Post Types `peliculas`, `series` y `documentales` con CPT UI, habilitados para GraphQL.
3. Definir `JWT_AUTH_SECRET_KEY` en `wp-config.php`, como indica el plugin de JWT. **No subir nunca esa clave al repositorio.**
4. Copiar `wordpress/plugins/miflix-ranking` en `wp-content/plugins/` y activarlo.
5. En `frontend/app.js`, cambiar `CONFIG.WP_URL` por la URL de tu WordPress.
6. Publicar la carpeta `frontend/` en cualquier servidor web.

## Autoría

Desarrollado por Fernanda Riffo.
