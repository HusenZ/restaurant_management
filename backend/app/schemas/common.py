from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    ok: bool = True
    message: str | None = None
