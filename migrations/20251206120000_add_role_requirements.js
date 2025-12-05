// migrations/20251206120000_add_role_requirements.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('roles', function (table) {
    table.boolean('requires_brands').defaultTo(false).notNullable();
    table.boolean('requires_locations').defaultTo(false).notNullable();
  }).then(() => {
    // Mavjud rollar uchun standart qiymatlar
    return knex('roles').where('role_name', 'admin').update({ requires_brands: true, requires_locations: false });
  }).then(() => {
    return knex('roles').where('role_name', 'manager').update({ requires_brands: true, requires_locations: true });
  }).then(() => {
    return knex('roles').where('role_name', 'operator').update({ requires_brands: false, requires_locations: true });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('roles', function (table) {
    table.dropColumn('requires_brands');
    table.dropColumn('requires_locations');
  });
};

