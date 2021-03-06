require 'benchmark'
require 'active_record'
config = {
  adapter: 'sqlite3',
  database: ENV['DATABASE_NAME'] || 'test/development.sqlite3',
  pool: 5,
  timeout: 5000
}
ActiveRecord::Base.establish_connection config
ActiveRecord::Base.logger = Logger.new(STDOUT)
