"""camara: huellas de fotos y consultas de IA

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-28 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('photo_embeddings',
    sa.Column('photo_id', sa.Integer(), nullable=False),
    sa.Column('model', sa.String(length=60), nullable=False),
    sa.Column('dim', sa.Integer(), nullable=False),
    sa.Column('vector', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['photo_id'], ['product_photos.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('photo_id')
    )
    op.create_table('ai_queries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('at', sa.DateTime(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('matched_product_id', sa.Integer(), nullable=True),
    sa.Column('input_tokens', sa.Integer(), nullable=False),
    sa.Column('output_tokens', sa.Integer(), nullable=False),
    sa.CheckConstraint("status IN ('pending','ok','error')", name='ck_ai_queries_status'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('ai_queries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_ai_queries_at'), ['at'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('ai_queries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ai_queries_at'))
    op.drop_table('ai_queries')
    op.drop_table('photo_embeddings')
