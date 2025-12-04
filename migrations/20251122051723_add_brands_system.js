/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Brendlar jadvali
    .createTable('brands', function(table) {
      table.increments('id').primary();
      table.string('name').notNullable().unique();
      table.integer('created_by').references('id').inTable('users');
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at');
    })
    // Brend-Filial bog'lanish jadvali
    .createTable('brand_locations', function(table) {
      table.increments('id').primary();
      table.integer('brand_id').notNullable().references('id').inTable('brands').onDelete('CASCADE');
      table.string('location_name').notNullable();
      table.unique(['brand_id', 'location_name']);
    })
    // Foydalanuvchi-Brend bog'lanish jadvali (Menejerlar uchun)
    .createTable('user_brands', function(table) {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('brand_id').notNullable().references('id').inTable('brands').onDelete('CASCADE');
      table.unique(['user_id', 'brand_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_brands')
    .dropTableIfExists('brand_locations')
    .dropTableIfExists('brands');
};
