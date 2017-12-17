class Follow < ApplicationRecord
  belongs_to :from, class_name: 'User'
  belongs_to :to, class_name: 'User'
  include ARSync
  sync_parent :from, inverse_of: :following_count
  sync_parent :to, inverse_of: :followed_count
  sync_parent :from, inverse_of: :followings
  sync_parent :to, inverse_of: :followings
  sync_parent :from, inverse_of: :is_followed, only_to: -> { to }
  sync_parent :to, inverse_of: :is_following, only_to: -> { from }
  sync_has_data(:from, includes: :from) { from.as_json only: [:id, :name] }
  sync_has_data(:from, includes: :from) { from.as_json only: [:id, :name] }
end
