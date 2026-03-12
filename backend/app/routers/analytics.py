"""
Router for analytics endpoints.

Each endpoint performs SQL aggregation queries on the interaction data
populated by the ETL pipeline. All endpoints require a `lab` query
parameter to filter results by lab (e.g., "lab-01").
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import case, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_session
from app.models.item import ItemRecord
from app.models.interaction import InteractionLog
from app.models.learner import Learner
from app.auth import get_api_key  # ✅ ИМПОРТ АУТЕНТИФИКАЦИИ

router = APIRouter()


async def get_lab_tasks(session: AsyncSession, lab: str):
    """Helper: Get lab ID and all task IDs/titles for a lab."""
    lab_num = lab.split("-")[1]
    lab_title_pattern = f"Lab {lab_num}"
    
    # Find lab
    lab_stmt = select(ItemRecord.id).where(
        ItemRecord.type == "lab",
        ItemRecord.title.like(f"%{lab_title_pattern}%")
    )
    lab_result = await session.exec(lab_stmt)
    lab_item = lab_result.first()
    if not lab_item:
        return None, []
    
    # Find tasks
    task_stmt = select(ItemRecord.id, ItemRecord.title).where(
        ItemRecord.type == "task",
        ItemRecord.parent_id == lab_item.id
    ).order_by(ItemRecord.title)
    
    task_result = await session.exec(task_stmt)
    tasks = task_result.all()
    
    return lab_item.id, tasks


@router.get("/scores")
async def get_scores(
    lab: str = Query(..., description="Lab identifier, e.g. 'lab-01'"),
    _api_key: str = Depends(get_api_key),  # ✅ АУТЕНТИФИКАЦИЯ
    session: AsyncSession = Depends(get_session),
):
    """Score distribution histogram for a given lab."""
    _, tasks = await get_lab_tasks(session, lab)
    task_ids = [task.id for task in tasks]
    
    if not task_ids:
        return [
            {"bucket": "0-25", "count": 0},
            {"bucket": "26-50", "count": 0},
            {"bucket": "51-75", "count": 0},
            {"bucket": "76-100", "count": 0},
        ]
    
    bucket_case = case(
        (InteractionLog.score <= 25, "0-25"),
        (InteractionLog.score <= 50, "26-50"),
        (InteractionLog.score <= 75, "51-75"),
        (InteractionLog.score <= 100, "76-100"),
        else_="0-25"
    )
    
    stmt = (
        select(
            bucket_case.label("bucket"),
            func.count(InteractionLog.id).label("count")
        )
        .where(
            InteractionLog.item_id.in_(task_ids),
            InteractionLog.score.isnot(None)
        )
        .group_by("bucket")
    )
    
    result = await session.exec(stmt)
    bucket_counts = {row.bucket: row.count for row in result.all()}
    
    return [
        {"bucket": "0-25", "count": bucket_counts.get("0-25", 0)},
        {"bucket": "26-50", "count": bucket_counts.get("26-50", 0)},
        {"bucket": "51-75", "count": bucket_counts.get("51-75", 0)},
        {"bucket": "76-100", "count": bucket_counts.get("76-100", 0)},
    ]


@router.get("/pass-rates")
async def get_pass_rates(
    lab: str = Query(..., description="Lab identifier, e.g. 'lab-01'"),
    _api_key: str = Depends(get_api_key),  # ✅ АУТЕНТИФИКАЦИЯ
    session: AsyncSession = Depends(get_session),
):
    """Per-task pass rates for a given lab."""
    _, tasks = await get_lab_tasks(session, lab)
    
    if not tasks:
        return []
    
    task_ids = [task.id for task in tasks]
    
    stats_stmt = select(
        InteractionLog.item_id,
        func.avg(InteractionLog.score).label("avg_score"),
        func.count(InteractionLog.id).label("attempts")
    ).where(
        InteractionLog.item_id.in_(task_ids),
        InteractionLog.score.isnot(None)
    ).group_by(InteractionLog.item_id)
    
    stats_result = await session.exec(stats_stmt)
    stats_dict = {row.item_id: row for row in stats_result.all()}
    
    return [
        {
            "task": task.title,
            "avg_score": round(stats_dict.get(task.id, 0).avg_score or 0, 1),
            "attempts": stats_dict.get(task.id, 0).attempts or 0,
        }
        for task in tasks
    ]


@router.get("/timeline")
async def get_timeline(
    lab: str = Query(..., description="Lab identifier, e.g. 'lab-01'"),
    _api_key: str = Depends(get_api_key),  # ✅ АУТЕНТИФИКАЦИЯ
    session: AsyncSession = Depends(get_session),
):
    """Submissions per day for a given lab."""
    _, tasks = await get_lab_tasks(session, lab)
    task_ids = [task.id for task in tasks]
    
    if not task_ids:
        return []
    
    stmt = (
        select(
            func.date(InteractionLog.created_at).label("date"),
            func.count(InteractionLog.id).label("submissions")
        )
        .where(InteractionLog.item_id.in_(task_ids))
        .group_by(func.date(InteractionLog.created_at))
        .order_by(func.date(InteractionLog.created_at))
    )
    
    result = await session.exec(stmt)
    return [
        {"date": row.date, "submissions": row.submissions}
        for row in result.all()
    ]


@router.get("/groups")
async def get_groups(
    lab: str = Query(..., description="Lab identifier, e.g. 'lab-01'"),
    _api_key: str = Depends(get_api_key),  # ✅ АУТЕНТИФИКАЦИЯ
    session: AsyncSession = Depends(get_session),
):
    """Per-group performance for a given lab."""
    lab_id, tasks = await get_lab_tasks(session, lab)
    
    if not tasks:
        return []
    
    task_ids = [task.id for task in tasks]
    
    stmt = (
        select(
            Learner.student_group.label("group"),
            func.avg(InteractionLog.score).label("avg_score"),
            func.count(func.distinct(InteractionLog.learner_id)).label("students")
        )
        .join(Learner, Learner.id == InteractionLog.learner_id)
        .where(
            InteractionLog.item_id.in_(task_ids),
            InteractionLog.score.isnot(None)
        )
        .group_by(Learner.student_group)
        .order_by(Learner.student_group)
    )
    
    result = await session.exec(stmt)
    
    return [
        {
            "group": row.group,
            "avg_score": round(row.avg_score, 1) if row.avg_score is not None else 0.0,
            "students": row.students,
        }
        for row in result.all()
    ]
