from alembic import context

from server.models import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connection = context.config.attributes.get("connection")
    if connection is None:  # uso desde la consola: alembic -c alembic.ini …
        from sqlalchemy import create_engine
        connection = create_engine(context.config.get_main_option("sqlalchemy.url")).connect()
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


run_migrations_online()
