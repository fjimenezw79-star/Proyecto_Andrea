"""tienda: pedidos en línea, envío en ventas y movimientos de pedidos

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-28 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_REASONS = "reason IN ('sale','sale_cancel','purchase','adjustment','import','layaway','layaway_cancel','return')"
NEW_REASONS = ("reason IN ('sale','sale_cancel','purchase','adjustment','import','layaway','layaway_cancel','return',"
               "'online','online_cancel')")


def upgrade() -> None:
    op.create_table('online_orders',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('folio', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('source', sa.String(length=12), nullable=False),
    sa.Column('customer_name', sa.String(length=120), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=False),
    sa.Column('delivery', sa.String(length=10), nullable=False),
    sa.Column('address', sa.Text(), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('items', sa.JSON(), nullable=False),
    sa.Column('subtotal_cents', sa.Integer(), nullable=False),
    sa.Column('shipping_cents', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('client_id', sa.String(length=36), nullable=True),
    sa.Column('sale_id', sa.String(length=36), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('handled_by', sa.Integer(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('pending','confirmed','paid','rejected')", name='ck_online_status'),
    sa.CheckConstraint("delivery IN ('pickup','shipping')", name='ck_online_delivery'),
    sa.CheckConstraint('shipping_cents >= 0 AND subtotal_cents >= 0', name='ck_online_money'),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ),
    sa.ForeignKeyConstraint(['handled_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('folio')
    )
    with op.batch_alter_table('online_orders', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_online_orders_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_online_orders_status'), ['status'], unique=False)

    with op.batch_alter_table('sales', schema=None) as batch_op:
        batch_op.add_column(sa.Column('shipping_cents', sa.Integer(), nullable=False, server_default='0'))
        batch_op.drop_constraint('ck_sales_source', type_='check')
        batch_op.create_check_constraint('ck_sales_source', "source IN ('pos','layaway','legacy','online')")

    with op.batch_alter_table('stock_movements', schema=None) as batch_op:
        batch_op.drop_constraint('ck_movements_reason', type_='check')
        batch_op.create_check_constraint('ck_movements_reason', NEW_REASONS)


def downgrade() -> None:
    with op.batch_alter_table('stock_movements', schema=None) as batch_op:
        batch_op.drop_constraint('ck_movements_reason', type_='check')
        batch_op.create_check_constraint('ck_movements_reason', OLD_REASONS)
    with op.batch_alter_table('sales', schema=None) as batch_op:
        batch_op.drop_constraint('ck_sales_source', type_='check')
        batch_op.create_check_constraint('ck_sales_source', "source IN ('pos','layaway','legacy')")
        batch_op.drop_column('shipping_cents')
    with op.batch_alter_table('online_orders', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_online_orders_status'))
        batch_op.drop_index(batch_op.f('ix_online_orders_created_at'))
    op.drop_table('online_orders')
